import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { flattenForDisplay, parsePayload } from "@/lib/parsing/event-payload"

export const dynamic = "force-dynamic"

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function pickFirstText(values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (!text) continue
    if (text.toLowerCase() === "null" || text.toLowerCase() === "undefined") continue
    return text
  }
  return ""
}

function normalizeAssignee(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const principal = pickFirstText([
      (parsed as Record<string, unknown>).assignedTo,
      (parsed as Record<string, unknown>).userPrincipalName,
      (parsed as Record<string, unknown>).email,
      (parsed as Record<string, unknown>).name,
      (parsed as Record<string, unknown>).displayName,
      (parsed as Record<string, unknown>).objectId,
    ])
    return principal || null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  return raw
}

function normalizeSummary(summary: unknown): string | null {
  const raw = String(summary ?? "").trim()
  if (!raw) return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    const msg = pickFirstText([record.message, record.description, record.title, record.incidentName, record.activity])
    if (msg) return msg.slice(0, 220)

    const product = Array.isArray(record.alertProductNames) ? String(record.alertProductNames[0] ?? "").trim() : ""
    const count = String(record.alertsCount ?? "").trim()
    if (product || count) {
      return `${product || "Security incident"}${count ? ` (${count} alerts)` : ""}`.slice(0, 220)
    }
    return null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  if (raw.includes("=") && raw.includes(";") && raw.length > 180) {
    return null
  }

  return raw.slice(0, 220)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50), 1), 200)
  const search = (searchParams.get("search") ?? "").trim()
  const severityFilter = (searchParams.get("severity") ?? "all").trim().toLowerCase()
  const statusFilter = (searchParams.get("status") ?? "all").trim().toLowerCase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let query = supabase
    .from("alerts")
    .select("*", { count: "exact" })
    .order("timestamp", { ascending: false })
  if (severityFilter !== "all") {
    query = query.eq("severity", severityFilter)
  }
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }
  if (search) {
    const escaped = search.replace(/[%_]/g, "")
    query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,id.ilike.%${escaped}%`)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const latestRunResult = await supabase
    .from("ingest_runs")
    .select("id")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestRunResult.error) {
    return NextResponse.json({ error: latestRunResult.error.message }, { status: 500 })
  }

  const latestRunId = latestRunResult.data?.id ?? null
  const eventUids = (data ?? [])
    .map((alert) => String(alert.id || "").replace(/^alert-/, ""))
    .filter(Boolean)

  const stagedResult = latestRunId && eventUids.length
    ? await supabase
      .from("stg_events")
      .select("event_uid,raw_row,payload_raw,payload_json")
      .eq("ingest_run_id", latestRunId)
      .in("event_uid", eventUids)
    : { data: [], error: null }

  if (stagedResult.error) {
    return NextResponse.json({ error: stagedResult.error.message }, { status: 500 })
  }

  const stagedMap = new Map(
    (stagedResult.data ?? []).map((item) => [item.event_uid, item])
  )

  const alertIds = (data ?? []).map((alert) => alert.id)
  const { data: overrides, error: overrideError } = alertIds.length
    ? await supabase.from("alert_overrides").select("alert_id,status,assignee").in("alert_id", alertIds)
    : { data: [], error: null }

  if (overrideError) {
    return NextResponse.json({ error: overrideError.message }, { status: 500 })
  }

  const overrideMap = new Map(
    (overrides ?? []).map((item) => [item.alert_id, item])
  )

  const alerts = (data ?? []).map((alert) => {
    const eventUid = String(alert.id || "").replace(/^alert-/, "")
    const staged = stagedMap.get(eventUid)
    const override = overrideMap.get(alert.id)
    const status = override?.status ?? alert.status
    const assignee = normalizeAssignee(override?.assignee)
      ?? normalizeAssignee(alert.assignee)
      ?? normalizeAssignee(alert.parsed_facts?.owner)
      ?? null
    const payloadInput = (
      (staged?.payload_raw ?? alert.payload_raw ?? "").trim() ||
      ((staged?.payload_json ?? alert.payload_json) ? JSON.stringify(staged?.payload_json ?? alert.payload_json) : "") ||
      (alert.description ?? "").trim()
    )
    const parsed = parsePayload(payloadInput)
    const parsedFacts = {
      ...parsed.facts,
      ...(alert.parsed_facts ?? {}),
    }
    parsedFacts.owner = normalizeAssignee(parsedFacts.owner) ?? ""
    const summary = normalizeSummary(parsedFacts.summary)
      ?? normalizeSummary(alert.description)
      ?? normalizeSummary(parsed.facts.summary)
      ?? normalizeSummary(alert.title)
      ?? "No description provided."
    const preview = flattenForDisplay(parsed.normalized, { maxItems: 12, maxValueLength: 120 })

    return {
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      status,
      source: alert.source,
      timestamp: alert.timestamp,
      description: alert.description,
      assignee,
      tactics: alert.tactics,
      affectedEntities: alert.affected_entities,
      recommendedActions: alert.recommended_actions,
      payloadRaw: staged?.payload_raw ?? alert.payload_raw,
      payloadJson: staged?.payload_json ?? alert.payload_json,
      rawPayloadFull: staged?.payload_raw ?? alert.payload_raw,
      rawRow: staged?.raw_row ?? null,
      provider: alert.provider,
      category: alert.category,
      eventCode: alert.event_code,
      eventName: alert.event_name,
      actor: alert.actor,
      resource: alert.resource,
      ipAddress: alert.ip_address,
      sourceFile: alert.source_file,
      payloadKind: parsed.kind,
      summary,
      parsedFacts,
      parsedFieldsPreview: preview,
      statusSource: override?.status || override?.assignee ? "analyst" : "detected",
    }
  })

  const severities = ["critical", "high", "medium", "low"] as const
  const severityTotals = { critical: 0, high: 0, medium: 0, low: 0 }

  for (const severity of severities) {
    const { count: severityCount, error: severityError } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("severity", severity)

    if (severityError) {
      return NextResponse.json({ error: severityError.message }, { status: 500 })
    }
    severityTotals[severity] = severityCount ?? 0
  }

  return NextResponse.json({
    alerts,
    total: count ?? 0,
    page,
    pageSize,
    severityTotals,
  })
}
