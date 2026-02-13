import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeAssignee(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    const principal = [
      record.assignedTo,
      record.userPrincipalName,
      record.email,
      record.name,
      record.displayName,
      record.objectId,
    ]
      .map((entry) => String(entry ?? "").trim())
      .find((entry) => entry && entry.toLowerCase() !== "null" && entry.toLowerCase() !== "undefined")
    return principal || null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  return raw
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [
    metricsResult,
    seriesResult,
    distributionResult,
    sourcesResult,
    alertsResult,
  ] = await Promise.all([
    supabase.from("threat_metrics").select("*"),
    supabase.from("alert_time_series").select("*").order("id"),
    supabase.from("severity_distribution").select("*"),
    supabase.from("attack_sources").select("*"),
    supabase.from("alerts").select("*").order("timestamp", { ascending: false }).limit(5),
  ])

  if (
    metricsResult.error ||
    seriesResult.error ||
    distributionResult.error ||
    sourcesResult.error ||
    alertsResult.error
  ) {
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 })
  }

  const recentAlertIds = (alertsResult.data ?? []).map((alert) => alert.id)
  const { data: overrides, error: overridesError } = recentAlertIds.length
    ? await supabase.from("alert_overrides").select("alert_id,status,assignee").in("alert_id", recentAlertIds)
    : { data: [], error: null }

  if (overridesError) {
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 })
  }

  const overrideMap = new Map((overrides ?? []).map((item) => [item.alert_id, item]))

  const threatMetrics = (metricsResult.data ?? []).map((item) => ({
    label: item.label,
    value: Number(item.value),
    change: Number(item.change),
    changeType: item.change_type,
  }))

  const alertTimeSeries = (seriesResult.data ?? []).map((point) => ({
    time: point.time,
    critical: point.critical,
    high: point.high,
    medium: point.medium,
    low: point.low,
  }))

  const severityMap = new Map<string, { name: string; value: number; fill: string }>()
  for (const item of distributionResult.data ?? []) {
    const key = String(item.name || "").toLowerCase()
    if (!key) continue
    const label = key.charAt(0).toUpperCase() + key.slice(1)
    const current = severityMap.get(key)
    if (current) {
      current.value += Number(item.value)
    } else {
      severityMap.set(key, {
        name: label,
        value: Number(item.value),
        fill: item.fill,
      })
    }
  }
  const severityDistribution = Array.from(severityMap.values())

  const topAttackSources = (sourcesResult.data ?? []).map((item) => ({
    country: item.country,
    count: item.count,
    percentage: Number(item.percentage),
  }))

  const recentAlerts = (alertsResult.data ?? []).map((alert) => {
    const override = overrideMap.get(alert.id)
    return {
      statusSource: override?.status || override?.assignee ? ("analyst" as const) : ("detected" as const),
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      status: override?.status ?? alert.status,
      source: alert.source,
      timestamp: alert.timestamp,
      description: alert.description,
      assignee: normalizeAssignee(override?.assignee) ?? normalizeAssignee(alert.assignee),
      tactics: alert.tactics,
      affectedEntities: alert.affected_entities,
      recommendedActions: alert.recommended_actions,
    }
  })

  return NextResponse.json({
    threatMetrics,
    alertTimeSeries,
    severityDistribution,
    topAttackSources,
    recentAlerts,
  })
}
