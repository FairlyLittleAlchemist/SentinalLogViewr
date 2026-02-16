import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createNoteSchema = z.object({
  body: z.string().min(2).max(4000),
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

  const parsed = createNoteSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note payload" }, { status: 400 })
  }

  const { data: note, error } = await supabase
    .from("alert_case_notes")
    .insert({
      case_id: id,
      body: parsed.data.body.trim(),
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error || !note) {
    return NextResponse.json({ error: error?.message ?? "Failed to add note" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "note_added",
    details: { noteId: note.id },
    created_by: user.id,
  })

  return NextResponse.json({
    note: {
      id: note.id,
      body: note.body,
      createdAt: note.created_at,
      createdBy: note.created_by,
    },
  })
}
