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

  const { data: versionRow, error: versionError } = await supabase
    .from("playbook_template_versions")
    .select("status")
    .eq("template_id", id)
    .eq("version", parsed.data.version)
    .maybeSingle()

  if (versionError || !versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 })
  }
  if (versionRow.status !== "approved") {
    return NextResponse.json({ error: "Rollback target must be approved" }, { status: 400 })
  }

  const { error } = await supabase
    .from("playbook_templates")
    .update({ current_version: parsed.data.version, updated_by: user.id })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
