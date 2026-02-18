import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const stepSchema = z.object({
  title: z.string().min(2).max(220),
  details: z.string().max(4000).nullable().optional(),
  stage: z.enum(["triage", "investigation", "containment", "eradication_recovery", "post_incident"]),
  required: z.boolean().optional().default(true),
  expectedMinutes: z.number().int().positive().nullable().optional(),
})

const updateSchema = z.object({
  name: z.string().min(3).max(140).optional(),
  description: z.string().max(4000).nullable().optional(),
  alertType: z.enum(["incident", "security_event", "activity", "firewall"]).nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  slaTargetMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
  strictMode: z.boolean().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(60).optional(),
  changeNotes: z.string().max(4000).nullable().optional(),
  approveDraft: z.boolean().optional().default(false),
  setCurrentVersion: z.number().int().positive().optional(),
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
  if (!(await hasPermission(supabase, user, role, "playbooks.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.read" }, { status: 403 })
  }

  const { data: template, error: templateError } = await supabase
    .from("playbook_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (templateError || !template) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 })
  }

  const { data: versions, error: versionsError } = await supabase
    .from("playbook_template_versions")
    .select("*")
    .eq("template_id", id)
    .order("version", { ascending: false })

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 })
  }

  const versionIds = (versions ?? []).map((entry) => entry.id)
  const { data: steps } = versionIds.length
    ? await supabase
      .from("playbook_template_steps")
      .select("*")
      .in("version_id", versionIds)
      .order("step_order", { ascending: true })
    : { data: [] }

  const groupedSteps = new Map<string, typeof steps>()
  for (const step of steps ?? []) {
    const list = groupedSteps.get(step.version_id) ?? []
    list.push(step)
    groupedSteps.set(step.version_id, list)
  }

  return NextResponse.json({
    playbook: {
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description,
      alertType: template.alert_type,
      severity: template.severity,
      slaTargetMinutes: template.sla_target_minutes,
      strictMode: template.strict_mode,
      isActive: template.is_active,
      currentVersion: template.current_version,
      versions: (versions ?? []).map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        changeNotes: version.change_notes,
        approvedAt: version.approved_at,
        steps: (groupedSteps.get(version.id) ?? []).map((step) => ({
          id: step.id,
          order: step.step_order,
          title: step.title,
          details: step.details,
          stage: step.stage,
          required: step.required,
          expectedMinutes: step.expected_minutes,
        })),
      })),
    },
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
  if (!(await hasPermission(supabase, user, role, "playbooks.edit"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.edit" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { data: template, error: templateError } = await supabase
    .from("playbook_templates")
    .select("id,current_version")
    .eq("id", id)
    .maybeSingle()

  if (templateError || !template) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updated_by: user.id }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()
  if (parsed.data.description !== undefined) updates.description = parsed.data.description?.trim() || null
  if (parsed.data.alertType !== undefined) updates.alert_type = parsed.data.alertType
  if (parsed.data.severity !== undefined) updates.severity = parsed.data.severity
  if (parsed.data.slaTargetMinutes !== undefined) updates.sla_target_minutes = parsed.data.slaTargetMinutes
  if (parsed.data.strictMode !== undefined) updates.strict_mode = parsed.data.strictMode
  if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive

  if (Object.keys(updates).length > 1) {
    const { error: updateError } = await supabase
      .from("playbook_templates")
      .update(updates)
      .eq("id", id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  let createdVersionNumber: number | null = null
  if (parsed.data.steps) {
    const { data: latestVersion } = await supabase
      .from("playbook_template_versions")
      .select("version")
      .eq("template_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (latestVersion?.version ?? template.current_version ?? 0) + 1
    const { data: version, error: versionError } = await supabase
      .from("playbook_template_versions")
      .insert({
        template_id: id,
        version: nextVersion,
        status: parsed.data.approveDraft ? "approved" : "draft",
        change_notes: parsed.data.changeNotes?.trim() || null,
        approved_by: parsed.data.approveDraft ? user.id : null,
        approved_at: parsed.data.approveDraft ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select("id,version")
      .single()

    if (versionError || !version) {
      return NextResponse.json({ error: versionError?.message ?? "Failed to create version" }, { status: 500 })
    }

    const stepsPayload = parsed.data.steps.map((step, index) => ({
      version_id: version.id,
      step_order: index + 1,
      title: step.title.trim(),
      details: step.details?.trim() || null,
      stage: step.stage,
      required: step.required ?? true,
      expected_minutes: step.expectedMinutes ?? null,
    }))

    const { error: stepsError } = await supabase
      .from("playbook_template_steps")
      .insert(stepsPayload)
    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 500 })
    }

    createdVersionNumber = version.version
    if (parsed.data.approveDraft) {
      updates.current_version = version.version
    }
  }

  const targetVersion = parsed.data.setCurrentVersion ?? createdVersionNumber
  if (targetVersion !== undefined && targetVersion !== null) {
    const { data: selectedVersion } = await supabase
      .from("playbook_template_versions")
      .select("id,status")
      .eq("template_id", id)
      .eq("version", targetVersion)
      .maybeSingle()

    if (!selectedVersion) {
      return NextResponse.json({ error: "Target version not found" }, { status: 400 })
    }
    if (selectedVersion.status !== "approved") {
      return NextResponse.json({ error: "Only approved versions can be set as current" }, { status: 400 })
    }

    const { error: templateUpdateError } = await supabase
      .from("playbook_templates")
      .update({ current_version: targetVersion, updated_by: user.id })
      .eq("id", id)
    if (templateUpdateError) {
      return NextResponse.json({ error: templateUpdateError.message }, { status: 500 })
    }
  }

  const { data: refreshed } = await supabase
    .from("playbook_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  return NextResponse.json({
    playbook: refreshed,
    createdVersion: createdVersionNumber,
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
  if (!(await hasPermission(supabase, user, role, "playbooks.edit"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.edit" }, { status: 403 })
  }

  const { count: executionCount } = await supabase
    .from("case_playbook_executions")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id)

  if ((executionCount ?? 0) > 0) {
    const { error } = await supabase
      .from("playbook_templates")
      .update({ is_active: false, updated_by: user.id })
      .eq("id", id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, mode: "deactivated" })
  }

  const { error } = await supabase
    .from("playbook_templates")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode: "deleted" })
}
