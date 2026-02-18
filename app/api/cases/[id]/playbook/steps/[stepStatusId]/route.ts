import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "skipped", "blocked"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; stepStatusId: string }> }
) {
  const { id, stepStatusId } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "cases.manage_playbook"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.manage_playbook" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { data: execution } = await supabase
    .from("case_playbook_executions")
    .select("id")
    .eq("case_id", id)
    .maybeSingle()

  if (!execution) {
    return NextResponse.json({ error: "Case playbook execution not found" }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
    if (parsed.data.status === "completed" || parsed.data.status === "skipped") {
      updates.completed_at = new Date().toISOString()
      updates.completed_by = user.id
    } else {
      updates.completed_at = null
      updates.completed_by = null
    }
  }
  if (parsed.data.notes !== undefined) {
    updates.notes = parsed.data.notes?.trim() || null
  }

  const { data: updated, error: updateError } = await supabase
    .from("case_playbook_step_status")
    .update(updates)
    .eq("id", stepStatusId)
    .eq("execution_id", execution.id)
    .select("id,status")
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Step not found" }, { status: 404 })
  }

  await supabase
    .from("alert_case_activity")
    .insert({
      case_id: id,
      action: "playbook_step_updated",
      details: {
        stepStatusId,
        status: parsed.data.status ?? null,
      },
      created_by: user.id,
    })

  return NextResponse.json({ step: updated })
}
