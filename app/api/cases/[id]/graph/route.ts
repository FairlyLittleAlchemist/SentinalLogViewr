import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function relationLabel(value: string) {
  const map: Record<string, string> = {
    primary: "Primary",
    related_to: "Related",
    same_actor: "Same actor",
    same_ip: "Same IP",
    same_resource: "Same resource",
  }
  return map[value] ?? "Related"
}

function createNodeId(prefix: string, id: string) {
  return `${prefix}-${id}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [alertsResult, logsResult] = await Promise.all([
    supabase
      .from("alert_case_alerts")
      .select(`
        alert_id,
        relation_type,
        is_primary,
        alerts(
          id,
          title,
          severity,
          source,
          timestamp,
          status,
          category,
          actor,
          resource,
          ip_address,
          description
        )
      `)
      .eq("case_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("alert_case_logs")
      .select(`
        log_id,
        relation_type,
        logs(
          id,
          message,
          severity,
          source,
          timestamp,
          status,
          category,
          actor,
          resource,
          ip_address
        )
      `)
      .eq("case_id", id)
      .order("created_at", { ascending: true }),
  ])

  if (alertsResult.error || logsResult.error) {
    return NextResponse.json({ error: "Failed to build case graph" }, { status: 500 })
  }

  let caseAlertLinks = alertsResult.data ?? []
  if (caseAlertLinks.length === 0) {
    const { data: caseRow } = await supabase
      .from("alert_cases")
      .select("alert_id")
      .eq("id", id)
      .maybeSingle()
    if (caseRow?.alert_id) {
      const { data: alertRow } = await supabase
        .from("alerts")
        .select("id,title,severity,source,timestamp,status,category,actor,resource,ip_address,description")
        .eq("id", caseRow.alert_id)
        .maybeSingle()
      if (alertRow) {
        caseAlertLinks = [{
          alert_id: alertRow.id,
          relation_type: "primary",
          is_primary: true,
          alerts: [alertRow],
        }]
      }
    }
  }

  const alertNodes = caseAlertLinks.flatMap((item, index) => {
    const alert = Array.isArray(item.alerts) ? item.alerts[0] : item.alerts
    if (!alert) return []
    return [{
      id: createNodeId("alert", alert.id),
      type: "artifact",
      position: { x: 80 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 180 },
      data: {
        label: alert.title,
        subtitle: `${alert.source} - ${new Date(alert.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`,
        nodeType: "alert",
        refId: alert.id,
        severity: alert.severity,
        expanded: false,
        details: [
          ["ID", alert.id],
          ["Severity", alert.severity],
          ["Status", alert.status],
          ["Source", alert.source],
          ["Category", alert.category],
          ["Actor", alert.actor],
          ["Resource", alert.resource],
          ["IP", alert.ip_address],
          ["Summary", alert.description],
        ].map(([label, value]) => ({ label, value: String(value ?? "").trim() })).filter((row) => row.value),
      },
      relationType: item.relation_type,
      isPrimary: item.is_primary,
    }]
  })

  const logNodes = (logsResult.data ?? []).flatMap((item, index) => {
    const log = Array.isArray(item.logs) ? item.logs[0] : item.logs
    if (!log) return []
    return [{
      id: createNodeId("log", log.id),
      type: "artifact",
      position: { x: 120 + (index % 3) * 280, y: 520 + Math.floor(index / 3) * 170 },
      data: {
        label: log.message || log.id,
        subtitle: `${log.source} - ${new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`,
        nodeType: "log",
        refId: log.id,
        severity: log.severity,
        expanded: false,
        details: [
          ["ID", log.id],
          ["Severity", log.severity],
          ["Status", log.status],
          ["Source", log.source],
          ["Category", log.category],
          ["Actor", log.actor],
          ["Resource", log.resource],
          ["IP", log.ip_address],
          ["Summary", log.message],
        ].map(([label, value]) => ({ label, value: String(value ?? "").trim() })).filter((row) => row.value),
      },
      relationType: item.relation_type,
    }]
  })

  const primaryAlert = alertNodes.find((node) => node.isPrimary) ?? alertNodes[0]
  const primaryNodeId = primaryAlert?.id ?? null

  const alertEdges = alertNodes
    .filter((node) => primaryNodeId && node.id !== primaryNodeId)
    .map((node) => ({
      id: `edge-${primaryNodeId}-${node.id}`,
      source: primaryNodeId,
      target: node.id,
      type: "smoothstep",
      animated: true,
      label: relationLabel(String(node.relationType ?? "related_to")),
      data: { edgeType: String(node.relationType ?? "related_to") },
    }))

  const logEdges = logNodes
    .filter(() => Boolean(primaryNodeId))
    .map((node) => ({
      id: `edge-${primaryNodeId}-${node.id}`,
      source: String(primaryNodeId),
      target: node.id,
      type: "smoothstep",
      animated: true,
      label: relationLabel(String(node.relationType ?? "related_to")),
      data: { edgeType: String(node.relationType ?? "related_to") },
    }))

  const nodes = [
    ...alertNodes.map(({ relationType: _relationType, isPrimary: _isPrimary, ...node }) => node),
    ...logNodes.map(({ relationType: _relationType, ...node }) => node),
  ]
  const edges = [...alertEdges, ...logEdges]

  return NextResponse.json({ nodes, edges })
}
