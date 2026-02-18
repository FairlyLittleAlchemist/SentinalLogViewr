import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const createBoardSchema = z.object({
  name: z.string().min(2).max(120),
  caseId: z.string().uuid().nullable().optional(),
  isShared: z.boolean().optional().default(false),
  boardType: z.enum(["master_shared", "sub_shared", "personal"]).optional(),
  parentBoardId: z.string().uuid().nullable().optional(),
})

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "boards.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "boards.read" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const caseId = searchParams.get("caseId")

  let query = supabase
    .from("investigation_boards")
    .select("*")
    .or(`owner_id.eq.${user.id},is_shared.eq.true`)
    .order("updated_at", { ascending: false })

  if (caseId) {
    query = query.eq("case_id", caseId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const boards = (data ?? []).map((board) => ({
    id: board.id,
    name: board.name,
    ownerId: board.owner_id,
    caseId: board.case_id,
    isShared: board.is_shared,
    boardType: board.board_type,
    parentBoardId: board.parent_board_id,
    viewport: board.viewport,
    createdAt: board.created_at,
    updatedAt: board.updated_at,
  }))

  return NextResponse.json({ boards })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

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

  const requestedType = parsed.data.boardType
  let boardType = requestedType
  if (!boardType) {
    if (parsed.data.caseId) {
      boardType = parsed.data.isShared ? "sub_shared" : "personal"
    } else {
      boardType = "personal"
    }
  }

  if (boardType === "master_shared" && !parsed.data.caseId) {
    return NextResponse.json({ error: "Master board requires caseId" }, { status: 400 })
  }
  if (boardType === "sub_shared" && !parsed.data.caseId) {
    return NextResponse.json({ error: "Sub-board requires caseId" }, { status: 400 })
  }

  const createPermission = boardType === "personal" ? "boards.create_personal" : "boards.create_case"
  if (!(await hasPermission(supabase, user, role, createPermission))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: createPermission }, { status: 403 })
  }

  let masterBoardId = parsed.data.parentBoardId ?? null
  if (parsed.data.caseId) {
    const { data: existingMaster } = await supabase
      .from("investigation_boards")
      .select("id")
      .eq("case_id", parsed.data.caseId)
      .eq("board_type", "master_shared")
      .maybeSingle()

    if (boardType === "master_shared" && existingMaster) {
      return NextResponse.json({ error: "master_board_exists" }, { status: 409 })
    }

    if (boardType === "sub_shared") {
      if (!existingMaster) {
        return NextResponse.json({ error: "missing_master_board" }, { status: 400 })
      }
      masterBoardId = masterBoardId ?? existingMaster.id

      const { count: subCount } = await supabase
        .from("investigation_boards")
        .select("id", { count: "exact", head: true })
        .eq("case_id", parsed.data.caseId)
        .eq("board_type", "sub_shared")

      if ((subCount ?? 0) >= 3) {
        return NextResponse.json({ error: "max_sub_boards_reached" }, { status: 409 })
      }
    }

    if (boardType === "personal") {
      const { data: existingPersonal } = await supabase
        .from("investigation_boards")
        .select("id")
        .eq("case_id", parsed.data.caseId)
        .eq("owner_id", user.id)
        .eq("board_type", "personal")
        .maybeSingle()
      if (existingPersonal) {
        return NextResponse.json({ error: "personal_board_exists" }, { status: 409 })
      }
    }
  }

  const { data, error } = await supabase
    .from("investigation_boards")
    .insert({
      name: parsed.data.name.trim(),
      owner_id: user.id,
      case_id: parsed.data.caseId ?? null,
      board_type: boardType,
      parent_board_id: boardType === "sub_shared" ? masterBoardId : null,
      is_shared: boardType === "master_shared" || boardType === "sub_shared",
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
      boardType: data.board_type,
      parentBoardId: data.parent_board_id,
      viewport: data.viewport,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  })
}
