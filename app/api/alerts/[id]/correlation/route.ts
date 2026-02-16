import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type CorrelationItem = {
  id: string
  title: string
  severity: string
  status: string
  timestamp: string
  source: string
  actor: string | null
  ipAddress: string | null
  resource: string | null
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

export async function GET(
  _req: Request,
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

  const { data: currentAlert, error: currentAlertError } = await supabase
    .from("alerts")
    .select("id,title,severity,status,timestamp,source,actor,ip_address,resource,event_code,parsed_facts")
    .eq("id", id)
    .maybeSingle()

  if (currentAlertError || !currentAlert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const { data: nearbyAlerts, error: nearbyError } = await supabase
    .from("alerts")
    .select("id,title,severity,status,timestamp,source,actor,ip_address,resource,event_code,parsed_facts")
    .neq("id", id)
    .order("timestamp", { ascending: false })
    .limit(250)

  if (nearbyError) {
    return NextResponse.json({ error: nearbyError.message }, { status: 500 })
  }

  const incidentId = String((currentAlert.parsed_facts as Record<string, unknown> | null)?.incidentId ?? "").trim()
  const actor = String(currentAlert.actor ?? "").trim()
  const ipAddress = String(currentAlert.ip_address ?? "").trim()
  const resource = String(currentAlert.resource ?? "").trim()

  const related = (nearbyAlerts ?? []).filter((alert) => {
    const parsedFacts = (alert.parsed_facts as Record<string, unknown> | null) ?? {}
    const alertIncidentId = String(parsedFacts.incidentId ?? "").trim()
    return (
      (incidentId && alertIncidentId && incidentId === alertIncidentId) ||
      (actor && String(alert.actor ?? "").trim() === actor) ||
      (ipAddress && String(alert.ip_address ?? "").trim() === ipAddress) ||
      (resource && String(alert.resource ?? "").trim() === resource)
    )
  })

  const toItem = (alert: typeof currentAlert): CorrelationItem => ({
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    timestamp: alert.timestamp,
    source: alert.source,
    actor: alert.actor,
    ipAddress: alert.ip_address,
    resource: alert.resource,
  })

  const allItems = [toItem(currentAlert), ...related.map(toItem)].sort((a, b) => (
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  ))

  const grouped = {
    byActor: unique([actor, ...related.map((item) => item.actor)]).map((value) => ({
      key: value,
      alerts: allItems.filter((item) => item.actor === value),
    })),
    byIp: unique([ipAddress, ...related.map((item) => item.ip_address)]).map((value) => ({
      key: value,
      alerts: allItems.filter((item) => item.ipAddress === value),
    })),
    byResource: unique([resource, ...related.map((item) => item.resource)]).map((value) => ({
      key: value,
      alerts: allItems.filter((item) => item.resource === value),
    })),
  }

  return NextResponse.json({
    alert: toItem(currentAlert),
    correlation: {
      totalRelated: related.length,
      timeline: allItems,
      grouped,
    },
  })
}
