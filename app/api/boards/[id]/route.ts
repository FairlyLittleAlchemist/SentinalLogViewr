import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const updateBoardSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  isShared: z.boolean().optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }).optional(),
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
  if (!(await hasPermission(supabase, user, role, "boards.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "boards.read" }, { status: 403 })
  }

  const { data: board, error: boardError } = await supabase
    .from("investigation_boards")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (boardError || !board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 })
  }

  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] = await Promise.all([
    supabase
      .from("investigation_board_nodes")
      .select("*")
      .eq("board_id", id),
    supabase
      .from("investigation_board_edges")
      .select("*")
      .eq("board_id", id),
  ])

  if (nodesError || edgesError) {
    return NextResponse.json({ error: "Failed to load board state" }, { status: 500 })
  }

  return NextResponse.json({
    board: {
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
    },
    nodes: (nodes ?? []).map((node) => ({
      id: node.node_id,
      type: "artifact",
      position: { x: Number(node.x), y: Number(node.y) },
      data: {
        label: node.label,
        subtitle: node.subtitle,
        nodeType: node.node_type,
        refId: node.ref_id,
        ...((node.data as Record<string, unknown>) ?? {}),
      },
    })),
    edges: (edges ?? []).map((edge) => ({
      id: edge.edge_id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      type: "smoothstep",
      animated: true,
      label: edge.label,
      data: {
        edgeType: edge.edge_type,
        ...((edge.data as Record<string, unknown>) ?? {}),
      },
    })),
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "boards.edit"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "boards.edit" }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = updateBoardSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid board update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()
  if (parsed.data.isShared !== undefined) updates.is_shared = parsed.data.isShared
  if (parsed.data.viewport !== undefined) updates.viewport = parsed.data.viewport

  const { data, error } = await supabase
    .from("investigation_boards")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Board not found" }, { status: 404 })
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "boards.delete"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "boards.delete" }, { status: 403 })
  }

  const { error } = await supabase
    .from("investigation_boards")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
