import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { flattenForDisplay, parsePayload } from "@/lib/parsing/event-payload"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50), 1), 200)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error, count } = await supabase
    .from("alerts")
    .select("*", { count: "exact" })
    .order("timestamp", { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alerts = (data ?? []).map((alert) => {
    const payloadInput = (alert.payload_raw ?? alert.description ?? "").trim()
    const parsed = parsePayload(payloadInput)
    const summary = parsed.facts.summary || alert.description || "No description provided."
    const preview = flattenForDisplay(parsed.normalized, { maxItems: 12, maxValueLength: 120 })

    return {
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
      payloadRaw: alert.payload_raw,
      payloadJson: alert.payload_json,
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
      parsedFieldsPreview: preview,
    }
  })

  return NextResponse.json({ alerts, total: count ?? 0, page, pageSize })
}
