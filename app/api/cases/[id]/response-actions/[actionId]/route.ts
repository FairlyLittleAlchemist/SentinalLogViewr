import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateResponseActionSchema = z.object({
  actionType: z.enum(["contain_host", "disable_user", "block_ip", "block_domain", "block_hash", "revoke_sessions", "isolate_resource", "other"]).optional(),
  target: z.string().min(2).max(500).optional(),
  status: z.enum(["planned", "in_progress", "completed", "failed", "cancelled"]).optional(),
  details: z.string().max(4000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { id, actionId } = await params
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

  const parsed = updateResponseActionSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.actionType !== undefined) updates.action_type = parsed.data.actionType
  if (parsed.data.target !== undefined) updates.target = parsed.data.target.trim()
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.details !== undefined) updates.details = parsed.data.details
  if (parsed.data.status === "completed") {
    updates.executed_by = user.id
    updates.executed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("alert_case_response_actions")
    .update(updates)
    .eq("case_id", id)
    .eq("id", actionId)
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Response action not found" }, { status: 404 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "response_action_updated",
    details: { responseActionId: actionId, ...parsed.data },
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

