import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
})

export async function GET() {
  const supabase = await createClient()
  const { user } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("feature_flags")
    .select("key,enabled,description,updated_at")
    .order("key", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ flags: data ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "admin.flags.manage"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "admin.flags.manage" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("feature_flags")
    .upsert({
      key: parsed.data.key,
      enabled: parsed.data.enabled,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select("key,enabled,description,updated_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to update flag" }, { status: 500 })
  }

  return NextResponse.json({ flag: data })
}
