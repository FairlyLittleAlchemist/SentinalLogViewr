import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "dismissed"]).optional(),
  assignee: z.string().nullable().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const alert = {
    id: data.id,
    title: data.title,
    severity: data.severity,
    status: data.status,
    source: data.source,
    timestamp: data.timestamp,
    description: data.description,
    assignee: data.assignee,
    tactics: data.tactics,
    affectedEntities: data.affected_entities,
    recommendedActions: data.recommended_actions,
  }

  return NextResponse.json({ alert })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("alerts")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const alert = {
    id: data.id,
    title: data.title,
    severity: data.severity,
    status: data.status,
    source: data.source,
    timestamp: data.timestamp,
    description: data.description,
    assignee: data.assignee,
    tactics: data.tactics,
    affectedEntities: data.affected_entities,
    recommendedActions: data.recommended_actions,
  }

  return NextResponse.json({ alert })
}
