import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
})

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
    .from("recommendations")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: "Recommendation not found" }, { status: 404 })
  }

  const recommendation = {
    id: data.id,
    title: data.title,
    priority: data.priority,
    category: data.category,
    description: data.description,
    impact: data.impact,
    effort: data.effort,
    status: data.status,
    relatedAlerts: data.related_alerts,
  }

  return NextResponse.json({ recommendation })
}
