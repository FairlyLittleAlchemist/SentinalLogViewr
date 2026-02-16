import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { flattenForDisplay, parsePayload } from "@/lib/parsing/event-payload"

export const dynamic = "force-dynamic"

const GENERIC_SUMMARY = "Event payload attached. Open details to inspect."

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50), 1), 200)
  const search = (searchParams.get("search") ?? "").trim()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let query = supabase
    .from("logs")
    .select("*", { count: "exact" })
    .order("timestamp", { ascending: false })

  if (search) {
    const escaped = search.replace(/[%_]/g, "")
    query = query.or(`id.ilike.%${escaped}%,message.ilike.%${escaped}%,source.ilike.%${escaped}%,actor.ilike.%${escaped}%,resource.ilike.%${escaped}%,ip_address.ilike.%${escaped}%`)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs = (data ?? []).map((log) => {
    const payloadInput = (
      (log.payload_raw ?? "").trim() ||
      (log.payload_json ? JSON.stringify(log.payload_json) : "") ||
      (log.message ?? "").trim()
    )
    const parsed = parsePayload(payloadInput)
    const preview = flattenForDisplay(parsed.normalized, { maxItems: 10, maxValueLength: 120 })
    const parsedFacts = {
      ...parsed.facts,
      ...(log.parsed_facts ?? {}),
    }
    const summary = parsedFacts.summary && parsedFacts.summary !== GENERIC_SUMMARY
      ? String(parsedFacts.summary)
      : log.message

    return {
      id: log.id,
      timestamp: log.timestamp,
      severity: log.severity,
      source: log.source,
      category: log.category,
      message: log.message,
      ipAddress: log.ip_address,
      user: log.user,
      status: log.status,
      payloadRaw: log.payload_raw,
      payloadJson: log.payload_json,
      provider: log.provider,
      eventCode: log.event_code,
      eventName: log.event_name,
      actor: log.actor,
      resource: log.resource,
      sourceFile: log.source_file,
      payloadKind: parsed.kind,
      summary,
      parsedFacts,
      parsedFieldsPreview: preview,
    }
  })

  return NextResponse.json({ logs, total: count ?? 0, page, pageSize })
}
