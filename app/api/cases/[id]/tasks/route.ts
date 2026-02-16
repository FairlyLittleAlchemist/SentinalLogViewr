import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createTaskSchema = z.object({
  title: z.string().min(2).max(240),
  dueAt: z.string().datetime().optional().nullable(),
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

  const parsed = createTaskSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 })
  }

  const { data: task, error } = await supabase
    .from("alert_case_tasks")
    .insert({
      case_id: id,
      title: parsed.data.title.trim(),
      due_at: parsed.data.dueAt ?? null,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? "Failed to add task" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "task_added",
    details: { taskId: task.id, title: task.title },
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
