import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const addLogSchema = z.object({
  logId: z.string().min(1),
  relationType: z.enum(["related_to", "same_actor", "same_ip", "same_resource"]).optional().default("related_to"),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "cases.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.read" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("alert_case_logs")
    .select(`
      case_id,
      log_id,
      relation_type,
      created_at,
      logs(
        id,
        message,
        severity,
        status,
        source,
        timestamp,
        actor,
        resource,
        ip_address
      )
    `)
    .eq("case_id", id)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs = (data ?? []).map((item) => {
    const log = Array.isArray(item.logs) ? item.logs[0] : item.logs
    return {
      logId: item.log_id,
      relationType: item.relation_type,
      linkedAt: item.created_at,
      log: log ? {
        id: log.id,
        message: log.message,
        severity: log.severity,
        status: log.status,
        source: log.source,
        timestamp: log.timestamp,
        actor: log.actor,
        resource: log.resource,
        ipAddress: log.ip_address,
      } : null,
    }
  })

  return NextResponse.json({ logs })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!(await hasPermission(supabase, user, role, "cases.link_logs"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.link_logs" }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = addLogSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid link payload" }, { status: 400 })
  }

  const { data: log, error: logError } = await supabase
    .from("logs")
    .select("id")
    .eq("id", parsed.data.logId)
    .maybeSingle()

  if (logError || !log) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("alert_case_logs")
    .upsert({
      case_id: id,
      log_id: parsed.data.logId,
      relation_type: parsed.data.relationType,
      created_by: user.id,
    }, {
      onConflict: "case_id,log_id",
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "log_linked",
    details: { logId: parsed.data.logId, relationType: parsed.data.relationType },
    created_by: user.id,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!(await hasPermission(supabase, user, role, "cases.link_logs"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.link_logs" }, { status: 403 })
  }

  const url = new URL(request.url)
  const logId = String(url.searchParams.get("logId") ?? "").trim()
  if (!logId) {
    return NextResponse.json({ error: "Missing logId" }, { status: 400 })
  }

  const { error } = await supabase
    .from("alert_case_logs")
    .delete()
    .eq("case_id", id)
    .eq("log_id", logId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "log_unlinked",
    details: { logId },
    created_by: user.id,
  })

  return NextResponse.json({ ok: true })
}
