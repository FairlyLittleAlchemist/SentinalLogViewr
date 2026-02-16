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

const createSchema = z.object({
  name: z.string().min(2).max(80),
  filters: filtersSchema,
  isShared: z.boolean().optional().default(false),
})

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  let query = supabase
    .from("saved_alert_views")
    .select("*")
    .order("created_at", { ascending: false })

  if (token) {
    query = query.eq("share_token", token).eq("is_shared", true)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const views = (data ?? [])
    .filter((entry) => token ? true : (entry.user_id === user.id || entry.is_shared))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      filters: entry.filters,
      isShared: entry.is_shared,
      shareToken: entry.share_token,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      ownerId: entry.user_id,
    }))

  return NextResponse.json({ views })
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

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid saved view payload" }, { status: 400 })
  }

  const shareToken = parsed.data.isShared ? crypto.randomUUID().replace(/-/g, "") : null
  const { data, error } = await supabase
    .from("saved_alert_views")
    .insert({
      user_id: user.id,
      name: parsed.data.name.trim(),
      filters: parsed.data.filters,
      is_shared: parsed.data.isShared,
      share_token: shareToken,
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create saved view" }, { status: 500 })
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
