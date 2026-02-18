import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const schema = z.object({
  version: z.number().int().positive(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "playbooks.approve"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.approve" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const now = new Date().toISOString()
  await supabase
    .from("playbook_template_versions")
    .update({ status: "archived" })
    .eq("template_id", id)
    .eq("status", "approved")
    .neq("version", parsed.data.version)

  const { data: approved, error: approveError } = await supabase
    .from("playbook_template_versions")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: now,
    })
    .eq("template_id", id)
    .eq("version", parsed.data.version)
    .select("id,version")
    .single()

  if (approveError || !approved) {
    return NextResponse.json({ error: approveError?.message ?? "Version not found" }, { status: 400 })
  }

  const { error: templateError } = await supabase
    .from("playbook_templates")
    .update({ current_version: parsed.data.version, updated_by: user.id })
    .eq("id", id)

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
