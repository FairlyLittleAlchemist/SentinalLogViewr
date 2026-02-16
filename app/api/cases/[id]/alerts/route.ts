import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const addAlertSchema = z.object({
  alertId: z.string().min(1),
  relationType: z.enum(["related_to", "same_actor", "same_ip", "same_resource"]).optional().default("related_to"),
})

async function getRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  return String(data?.role ?? "").toLowerCase()
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

  const { data, error } = await supabase
    .from("alert_case_alerts")
    .select(`
      case_id,
      alert_id,
      relation_type,
      is_primary,
      created_at,
      alerts(
        id,
        title,
        severity,
        status,
        type,
        source,
        timestamp
      )
    `)
    .eq("case_id", id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alerts = (data ?? []).map((item) => {
    const alert = Array.isArray(item.alerts) ? item.alerts[0] : item.alerts
    return {
      alertId: item.alert_id,
      relationType: item.relation_type,
      isPrimary: item.is_primary,
      linkedAt: item.created_at,
      alert: alert ? {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        status: alert.status,
        type: alert.type,
        source: alert.source,
        timestamp: alert.timestamp,
      } : null,
    }
  })

  return NextResponse.json({ alerts })
}

export async function POST(
  request: Request,
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

  const role = await getRole(supabase, user.id)
  if (role !== "admin" && role !== "analyst") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = addAlertSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid link payload" }, { status: 400 })
  }

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("id")
    .eq("id", parsed.data.alertId)
    .maybeSingle()

  if (alertError || !alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("alert_case_alerts")
    .upsert({
      case_id: id,
      alert_id: parsed.data.alertId,
      relation_type: parsed.data.relationType,
      is_primary: false,
      created_by: user.id,
    }, {
      onConflict: "case_id,alert_id",
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "alert_linked",
    details: { alertId: parsed.data.alertId, relationType: parsed.data.relationType },
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = await getRole(supabase, user.id)
  if (role !== "admin" && role !== "analyst") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const alertId = String(url.searchParams.get("alertId") ?? "").trim()
  if (!alertId) {
    return NextResponse.json({ error: "Missing alertId" }, { status: 400 })
  }

  const { data: linked } = await supabase
    .from("alert_case_alerts")
    .select("is_primary")
    .eq("case_id", id)
    .eq("alert_id", alertId)
    .maybeSingle()

  if (!linked) {
    return NextResponse.json({ error: "Linked alert not found" }, { status: 404 })
  }

  if (linked.is_primary) {
    return NextResponse.json({ error: "Primary alert cannot be removed from case" }, { status: 400 })
  }

  const { error } = await supabase
    .from("alert_case_alerts")
    .delete()
    .eq("case_id", id)
    .eq("alert_id", alertId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "alert_unlinked",
    details: { alertId },
    created_by: user.id,
  })

  return NextResponse.json({ ok: true })
}

