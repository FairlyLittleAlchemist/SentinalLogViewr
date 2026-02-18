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

const createSchema = z.object({
  key: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/),
  name: z.string().min(3).max(140),
  description: z.string().max(4000).nullable().optional(),
  alertType: z.enum(["incident", "security_event", "activity", "firewall"]).nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  slaTargetMinutes: z.number().int().positive().max(60 * 24 * 30).optional().default(240),
  strictMode: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  steps: z.array(stepSchema).min(1).max(60),
})

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "playbooks.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.read" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const alertType = searchParams.get("alertType")
  const isActiveFilter = searchParams.get("isActive")

  let query = supabase
    .from("playbook_templates")
    .select("id,key,name,description,alert_type,severity,sla_target_minutes,strict_mode,is_active,current_version,updated_at")
    .order("name", { ascending: true })

  if (alertType) {
    query = query.eq("alert_type", alertType)
  }
  if (isActiveFilter === "true") {
    query = query.eq("is_active", true)
  } else if (isActiveFilter === "false") {
    query = query.eq("is_active", false)
  }

  const { data: templates, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!templates?.length) {
    return NextResponse.json({ playbooks: [] })
  }

  const templateIds = templates.map((t) => t.id)
  const { data: versions } = await supabase
    .from("playbook_template_versions")
    .select("id,template_id,version,status,approved_at,change_notes")
    .in("template_id", templateIds)
    .order("version", { ascending: false })

  const currentVersionIdByTemplate = new Map<string, string>()
  const latestVersionIdByTemplate = new Map<string, string>()
  const versionListByTemplate = new Map<string, Array<Record<string, unknown>>>()
  for (const row of versions ?? []) {
    const list = versionListByTemplate.get(row.template_id) ?? []
    list.push(row)
    versionListByTemplate.set(row.template_id, list)
  }

  for (const template of templates) {
    const latest = (versions ?? []).find((v) => v.template_id === template.id)
    if (latest) {
      latestVersionIdByTemplate.set(template.id, latest.id)
    }
    const found = (versions ?? []).find((v) => v.template_id === template.id && v.version === template.current_version)
    if (found) {
      currentVersionIdByTemplate.set(template.id, found.id)
    }
  }

  const versionIds = Array.from(new Set([
    ...Array.from(currentVersionIdByTemplate.values()),
    ...Array.from(latestVersionIdByTemplate.values()),
  ]))
  const { data: steps } = versionIds.length
    ? await supabase
      .from("playbook_template_steps")
      .select("id,version_id,step_order,title,details,stage,required,expected_minutes")
      .in("version_id", versionIds)
      .order("step_order", { ascending: true })
    : { data: [] }

  const stepsByVersionId = new Map<string, Array<Record<string, unknown>>>()
  for (const step of steps ?? []) {
    const list = stepsByVersionId.get(step.version_id) ?? []
    list.push(step)
    stepsByVersionId.set(step.version_id, list)
  }

  const playbooks = templates.map((template) => {
    const currentVersionId = currentVersionIdByTemplate.get(template.id) ?? null
    const latestVersionId = latestVersionIdByTemplate.get(template.id) ?? null
    const editorVersionId = latestVersionId ?? currentVersionId
    const currentSteps = editorVersionId ? (stepsByVersionId.get(editorVersionId) ?? []) : []
    const versionsForTemplate = versionListByTemplate.get(template.id) ?? []
    return {
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
      editorVersion: versionsForTemplate[0]?.version ?? template.current_version,
      updatedAt: template.updated_at,
      versions: versionsForTemplate.map((versionRow) => ({
        id: versionRow.id,
        version: versionRow.version,
        status: versionRow.status,
        approvedAt: versionRow.approved_at,
        changeNotes: versionRow.change_notes,
      })),
      steps: currentSteps.map((step) => ({
        id: step.id,
        order: step.step_order,
        title: step.title,
        details: step.details,
        stage: step.stage,
        required: step.required,
        expectedMinutes: step.expected_minutes,
      })),
    }
  })

  return NextResponse.json({ playbooks })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "playbooks.edit"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "playbooks.edit" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const payload = parsed.data
  const { data: template, error: templateError } = await supabase
    .from("playbook_templates")
    .insert({
      key: payload.key,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      alert_type: payload.alertType ?? null,
      severity: payload.severity ?? null,
      sla_target_minutes: payload.slaTargetMinutes,
      strict_mode: payload.strictMode,
      is_active: payload.isActive,
      current_version: 1,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id,key,name,current_version")
    .single()

  if (templateError || !template) {
    return NextResponse.json({ error: templateError?.message ?? "Failed to create playbook" }, { status: 500 })
  }

  const { data: version, error: versionError } = await supabase
    .from("playbook_template_versions")
    .insert({
      template_id: template.id,
      version: 1,
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single()

  if (versionError || !version) {
    return NextResponse.json({ error: versionError?.message ?? "Failed to create playbook version" }, { status: 500 })
  }

  const stepsPayload = payload.steps.map((step, index) => ({
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

  return NextResponse.json({ id: template.id })
}
