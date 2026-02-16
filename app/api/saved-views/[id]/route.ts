import { NextResponse } from "next/server"
import { z } from "zod"
import crypto from "node:crypto"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const filtersSchema = z.object({
  search: z.string().default(""),
  severity: z.string().default("all"),
  status: z.string().default("all"),
  type: z.string().default("incident"),
})

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  filters: filtersSchema.optional(),
  isShared: z.boolean().optional(),
})

export async function PATCH(
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

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()
  if (parsed.data.filters !== undefined) updates.filters = parsed.data.filters
  if (parsed.data.isShared !== undefined) {
    updates.is_shared = parsed.data.isShared
    updates.share_token = parsed.data.isShared ? crypto.randomUUID().replace(/-/g, "") : null
  }

  const { data, error } = await supabase
    .from("saved_alert_views")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Saved view not found" }, { status: 404 })
  }

  return NextResponse.json({
    view: {
      id: data.id,
      name: data.name,
      filters: data.filters,
      isShared: data.is_shared,
      shareToken: data.share_token,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      ownerId: data.user_id,
    },
  })
}

export async function DELETE(
  _request: Request,
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

  const { error } = await supabase
    .from("saved_alert_views")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
