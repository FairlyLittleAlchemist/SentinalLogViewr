import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const nodeSchema = z.object({
  id: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.any()).optional().default({}),
})

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional().nullable(),
  data: z.record(z.any()).optional().default({}),
})

const stateSchema = z.object({
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
})

const EDGE_TYPE_MAP: Record<string, string> = {
  related_to: "related_to",
  causes: "caused_by",
  caused_by: "caused_by",
  mitigates: "hypothesis",
  hypothesis: "hypothesis",
  contains: "observed_on",
  observed_on: "observed_on",
  same_actor: "same_actor",
  same_ip: "same_ip",
  same_resource: "observed_on",
}

function normalizeEdgeType(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase()
  return EDGE_TYPE_MAP[raw] ?? "related_to"
}

export async function PUT(
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

  const parsed = stateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid board state payload" }, { status: 400 })
  }

  const { error: boardUpdateError } = await supabase
    .from("investigation_boards")
    .update({ viewport: parsed.data.viewport })
    .eq("id", id)

  if (boardUpdateError) {
    return NextResponse.json({ error: boardUpdateError.message }, { status: 500 })
  }

  const { error: deleteEdgesError } = await supabase
    .from("investigation_board_edges")
    .delete()
    .eq("board_id", id)
  if (deleteEdgesError) {
    return NextResponse.json({ error: deleteEdgesError.message }, { status: 500 })
  }

  const { error: deleteNodesError } = await supabase
    .from("investigation_board_nodes")
    .delete()
    .eq("board_id", id)
  if (deleteNodesError) {
    return NextResponse.json({ error: deleteNodesError.message }, { status: 500 })
  }

  if (parsed.data.nodes.length > 0) {
    const nodeRows = parsed.data.nodes.map((node) => ({
      board_id: id,
      node_id: node.id,
      node_type: String(node.data.nodeType ?? "entity"),
      ref_id: node.data.refId ? String(node.data.refId) : null,
      label: node.data.label ? String(node.data.label) : node.id,
      subtitle: node.data.subtitle ? String(node.data.subtitle) : null,
      x: node.position.x,
      y: node.position.y,
      data: node.data ?? {},
    }))
    const { error: insertNodesError } = await supabase
      .from("investigation_board_nodes")
      .insert(nodeRows)

    if (insertNodesError) {
      return NextResponse.json({ error: insertNodesError.message }, { status: 500 })
    }
  }

  if (parsed.data.edges.length > 0) {
    const edgeRows = parsed.data.edges.map((edge) => ({
      board_id: id,
      edge_id: edge.id,
      source_node_id: edge.source,
      target_node_id: edge.target,
      edge_type: normalizeEdgeType(edge.data.edgeType),
      label: edge.label ?? null,
      data: edge.data ?? {},
    }))
    const { error: insertEdgesError } = await supabase
      .from("investigation_board_edges")
      .insert(edgeRows)

    if (insertEdgesError) {
      return NextResponse.json({ error: insertEdgesError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
