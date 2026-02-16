import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createBoardSchema = z.object({
  name: z.string().min(2).max(120),
  caseId: z.string().uuid().nullable().optional(),
  isShared: z.boolean().optional().default(false),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("investigation_boards")
    .select("*")
    .or(`owner_id.eq.${user.id},is_shared.eq.true`)
    .order("updated_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const boards = (data ?? []).map((board) => ({
    id: board.id,
    name: board.name,
    ownerId: board.owner_id,
    caseId: board.case_id,
    isShared: board.is_shared,
    viewport: board.viewport,
    createdAt: board.created_at,
    updatedAt: board.updated_at,
  }))

  return NextResponse.json({ boards })
}

export async function POST(request: Request) {
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

  const parsed = createBoardSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid board payload" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("investigation_boards")
    .insert({
      name: parsed.data.name.trim(),
      owner_id: user.id,
      case_id: parsed.data.caseId ?? null,
      is_shared: parsed.data.isShared,
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create board" }, { status: 500 })
  }

  return NextResponse.json({
    board: {
      id: data.id,
      name: data.name,
      ownerId: data.owner_id,
      caseId: data.case_id,
      isShared: data.is_shared,
      viewport: data.viewport,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  })
}
