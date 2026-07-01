import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { flattenForDisplay, parsePayload } from "@/lib/parsing/event-payload"
import { normalizeAssignee, normalizeSummary } from "@/lib/alerts/normalization"

export const dynamic = "force-dynamic"

function withSearch<T extends { or: (filters: string) => T }>(query: T, search: string): T {
  if (!search) return query
  const escaped = search.replace(/[%_]/g, "")
  return query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,id.ilike.%${escaped}%`)
}

function normalizeLookupId(value: string): string {
  return value.replace(/^alert-/, "").trim()
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50), 1), 200)
  const search = (searchParams.get("search") ?? "").trim()
  const severityFilter = (searchParams.get("severity") ?? "all").trim().toLowerCase()
  const statusFilter = (searchParams.get("status") ?? "all").trim().toLowerCase()
  const typeParam = searchParams.get("type") ?? searchParams.get("kind") ?? "all"
  const typeFilter = typeParam.trim().toLowerCase()
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
  if (typeFilter !== "all") {
    query = query.eq("type", typeFilter)
  }
  query = withSearch(query, search)

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
  const lookupIds = Array.from(new Set([
    ...alertIds,
    ...alertIds.map((id) => normalizeLookupId(String(id))),
  ].filter(Boolean)))

  const { data: overrides, error: overrideError } = alertIds.length
    ? await supabase.from("alert_overrides").select("alert_id,status,assignee").in("alert_id", alertIds)
    : { data: [], error: null }

  if (overrideError) {
    return NextResponse.json({ error: overrideError.message }, { status: 500 })
  }

  const overrideMap = new Map(
    (overrides ?? []).map((item) => [item.alert_id, item])
  )

  const { data: resolutions, error: resolutionError } = lookupIds.length
    ? await supabase
      .from("alert_resolution_knowledge")
      .select("linked_alert_id,alert_type,severity,fingerprint,issue_summary,root_cause,remediation_steps,containment_steps,validation_steps,outcome,tags")
      .in("linked_alert_id", lookupIds)
    : { data: [], error: null }

  if (resolutionError) {
    return NextResponse.json({ error: resolutionError.message }, { status: 500 })
  }

  const resolutionMap = new Map<string, Record<string, unknown>>()
  for (const row of resolutions ?? []) {
    const linkedAlertId = String(row.linked_alert_id ?? "").trim()
    if (!linkedAlertId || resolutionMap.has(linkedAlertId)) continue
    resolutionMap.set(linkedAlertId, {
      alert_type: row.alert_type ?? null,
      severity: row.severity ?? null,
      fingerprint: row.fingerprint ?? null,
      issue_summary: row.issue_summary ?? null,
      root_cause: row.root_cause ?? null,
      remediation_steps: row.remediation_steps ?? null,
      containment_steps: row.containment_steps ?? null,
      validation_steps: row.validation_steps ?? null,
      outcome: row.outcome ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
    })
  }

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
    const linkedResolution =
      resolutionMap.get(String(alert.id))
      ?? resolutionMap.get(eventUid)
      ?? null

    const parsedFacts = {
      ...parsed.facts,
      ...(alert.parsed_facts ?? {}),
      ...(linkedResolution ? { n8nResolution: linkedResolution } : {}),
    }
    parsedFacts.owner = normalizeAssignee(parsedFacts.owner) ?? ""
    const summary = normalizeSummary(parsedFacts.summary)
      ?? normalizeSummary(alert.description)
      ?? normalizeSummary(parsed.facts.summary)
      ?? normalizeSummary(alert.title)
      ?? "No description provided."
    const preview = flattenForDisplay(parsed.normalized, { maxItems: 12, maxValueLength: 120 })

    const resolvedType =
      (alert.type && String(alert.type)) ||
      (typeof parsedFacts.kind === "string" ? parsedFacts.kind : "") ||
      (typeFilter !== "all" ? typeFilter : null) ||
      null

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
      type: resolvedType,
      parsedFacts,
      parsedFieldsPreview: preview,
      statusSource: override?.status || override?.assignee ? "analyst" : "detected",
    }
  })

  const severities = ["critical", "high", "medium", "low"] as const
  const severityTotals = { critical: 0, high: 0, medium: 0, low: 0 }

  for (const severity of severities) {
    let severityQuery = supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("severity", severity)

    if (statusFilter !== "all") {
      severityQuery = severityQuery.eq("status", statusFilter)
    }
    if (typeFilter !== "all") {
      severityQuery = severityQuery.eq("type", typeFilter)
    }
    severityQuery = withSearch(severityQuery, search)

    const { count: severityCount, error: severityError } = await severityQuery
    if (severityError) {
      return NextResponse.json({ error: severityError.message }, { status: 500 })
    }
    severityTotals[severity] = severityCount ?? 0
  }

  const alertTypes = ["incident", "activity", "firewall", "security_event"] as const
  const typeTotals: Record<(typeof alertTypes)[number] | "all", number> = {
    all: 0,
    incident: 0,
    activity: 0,
    firewall: 0,
    security_event: 0,
  }

  for (const alertType of alertTypes) {
    let kindQuery = supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("type", alertType)

    if (severityFilter !== "all") {
      kindQuery = kindQuery.eq("severity", severityFilter)
    }
    if (statusFilter !== "all") {
      kindQuery = kindQuery.eq("status", statusFilter)
    }
    kindQuery = withSearch(kindQuery, search)

    const { count: alertTypeCount, error: alertTypeError } = await kindQuery
    if (alertTypeError) {
      return NextResponse.json({ error: alertTypeError.message }, { status: 500 })
    }
    typeTotals[alertType] = alertTypeCount ?? 0
  }

  // Compute the “all alerts” total (same filters except type)
  typeTotals.all = Object.values(typeTotals)
    .filter((value): value is number => typeof value === "number")
    .reduce((sum, next) => sum + next, 0)

  return NextResponse.json({
    alerts,
    total: count ?? 0,
    page,
    pageSize,
    severityTotals,
    typeTotals,
  })
}
