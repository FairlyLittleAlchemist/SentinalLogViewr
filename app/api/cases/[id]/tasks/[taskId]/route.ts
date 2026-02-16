import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateTaskSchema = z.object({
  isDone: z.boolean().optional(),
  title: z.string().min(2).max(240).optional(),
  dueAt: z.string().datetime().optional().nullable(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
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

  const parsed = updateTaskSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.isDone !== undefined) updates.is_done = parsed.data.isDone
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim()
  if (parsed.data.dueAt !== undefined) updates.due_at = parsed.data.dueAt

  const { data: task, error } = await supabase
    .from("alert_case_tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("case_id", id)
    .select("*")
    .single()

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? "Task not found" }, { status: 404 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "task_updated",
    details: { taskId, ...parsed.data },
    created_by: user.id,
  })

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      isDone: task.is_done,
      dueAt: task.due_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      createdBy: task.created_by,
    },
  })
}
