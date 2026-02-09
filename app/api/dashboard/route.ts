import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

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

  const severityDistribution = (distributionResult.data ?? []).map((item) => ({
    name: item.name,
    value: item.value,
    fill: item.fill,
  }))

  const topAttackSources = (sourcesResult.data ?? []).map((item) => ({
    country: item.country,
    count: item.count,
    percentage: Number(item.percentage),
  }))

  const recentAlerts = (alertsResult.data ?? []).map((alert) => ({
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    source: alert.source,
    timestamp: alert.timestamp,
    description: alert.description,
    assignee: alert.assignee,
    tactics: alert.tactics,
    affectedEntities: alert.affected_entities,
    recommendedActions: alert.recommended_actions,
  }))

  return NextResponse.json({
    threatMetrics,
    alertTimeSeries,
    severityDistribution,
    topAttackSources,
    recentAlerts,
  })
}
