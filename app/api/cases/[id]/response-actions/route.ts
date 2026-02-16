import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createResponseActionSchema = z.object({
  actionType: z.enum(["contain_host", "disable_user", "block_ip", "block_domain", "block_hash", "revoke_sessions", "isolate_resource", "other"]),
  target: z.string().min(2).max(500),
  status: z.enum(["planned", "in_progress", "completed", "failed", "cancelled"]).optional().default("planned"),
  details: z.string().max(4000).optional().nullable(),
})

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

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = createResponseActionSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid response action payload" }, { status: 400 })
  }

  const isCompleted = parsed.data.status === "completed"
  const { data, error } = await supabase
    .from("alert_case_response_actions")
    .insert({
      case_id: id,
      action_type: parsed.data.actionType,
      target: parsed.data.target.trim(),
      status: parsed.data.status,
      details: parsed.data.details ?? null,
      created_by: user.id,
      executed_by: isCompleted ? user.id : null,
      executed_at: isCompleted ? new Date().toISOString() : null,
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create response action" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "response_action_added",
    details: { responseActionId: data.id, status: data.status, actionType: data.action_type },
    created_by: user.id,
  })

  return NextResponse.json({
    responseAction: {
      id: data.id,
      actionType: data.action_type,
      target: data.target,
      status: data.status,
      details: data.details,
      executedBy: data.executed_by,
      executedAt: data.executed_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
    },
  })
}

