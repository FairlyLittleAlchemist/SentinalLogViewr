import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const bindSchema = z.object({
  action: z.literal("bind"),
  templateId: z.string().uuid().optional(),
})

const reseedSchema = z.object({
  action: z.literal("reseed"),
})

const actionSchema = z.union([bindSchema, reseedSchema])

type StageKey = "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident"

async function loadExecutionState(supabase: Awaited<ReturnType<typeof createClient>>, caseId: string) {
  const { data: execution } = await supabase
    .from("case_playbook_executions")
    .select("id,case_id,template_id,version_id,strict_mode,status,started_at,completed_at,playbook_templates(id,key,name,current_version)")
    .eq("case_id", caseId)
    .maybeSingle()

  if (!execution) {
    return { execution: null, steps: [] as Array<Record<string, unknown>>, stageProgress: {} as Record<StageKey, { done: number; total: number }> }
  }

  const { data: steps } = await supabase
    .from("playbook_template_steps")
    .select("id,step_order,title,details,stage,required,expected_minutes")
    .eq("version_id", execution.version_id)
    .order("step_order", { ascending: true })

  const stepIds = (steps ?? []).map((step) => step.id)
  const { data: statuses } = stepIds.length
    ? await supabase
      .from("case_playbook_step_status")
      .select("id,step_id,status,notes,completed_at,completed_by")
      .eq("execution_id", execution.id)
      .in("step_id", stepIds)
    : { data: [] }

  const statusByStepId = new Map((statuses ?? []).map((status) => [status.step_id, status]))
  const stageProgress: Record<StageKey, { done: number; total: number }> = {
    triage: { done: 0, total: 0 },
    investigation: { done: 0, total: 0 },
    containment: { done: 0, total: 0 },
    eradication_recovery: { done: 0, total: 0 },
    post_incident: { done: 0, total: 0 },
  }

  const mergedSteps = (steps ?? []).map((step) => {
    const status = statusByStepId.get(step.id)
    const stage = step.stage as StageKey
    if (stageProgress[stage]) {
      stageProgress[stage].total += 1
      if (status?.status === "completed" || status?.status === "skipped") {
        stageProgress[stage].done += 1
      }
    }
    return {
      id: step.id,
      order: step.step_order,
      title: step.title,
      details: step.details,
      stage,
      required: step.required,
      expectedMinutes: step.expected_minutes,
      statusId: status?.id ?? null,
      status: status?.status ?? "pending",
      notes: status?.notes ?? null,
      completedAt: status?.completed_at ?? null,
    }
  })

  const totals = mergedSteps.reduce((acc, step) => {
    acc.total += 1
    if (step.status === "completed" || step.status === "skipped") {
      acc.done += 1
    }
    if (step.required) {
      acc.requiredTotal += 1
      if (step.status === "completed" || step.status === "skipped") {
        acc.requiredDone += 1
      }
    }
    return acc
  }, { done: 0, total: 0, requiredDone: 0, requiredTotal: 0 })

  return {
    execution: {
      id: execution.id,
      templateId: execution.template_id,
      versionId: execution.version_id,
      strictMode: execution.strict_mode,
      status: execution.status,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
      template: execution.playbook_templates,
      progress: totals,
    },
    steps: mergedSteps,
    stageProgress,
  }
}

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
  if (!(await hasPermission(supabase, user, role, "cases.read"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.read" }, { status: 403 })
  }

  const state = await loadExecutionState(supabase, id)
  return NextResponse.json(state)
}

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
  if (!(await hasPermission(supabase, user, role, "cases.manage_playbook"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.manage_playbook" }, { status: 403 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = actionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  if (parsed.data.action === "bind") {
    const { data: caseRow, error: caseError } = await supabase
      .from("alert_cases")
      .select("id,alert_type")
      .eq("id", id)
      .maybeSingle()
    if (caseError || !caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    let templateQuery = supabase
      .from("playbook_templates")
      .select("id,key,current_version,strict_mode,alert_type")
      .eq("is_active", true)
      .limit(1)

    if (parsed.data.templateId) {
      templateQuery = templateQuery.eq("id", parsed.data.templateId)
    } else if (caseRow.alert_type) {
      templateQuery = templateQuery.eq("alert_type", caseRow.alert_type)
    } else {
      templateQuery = templateQuery.order("updated_at", { ascending: false })
    }

    const { data: template, error: templateError } = await templateQuery.maybeSingle()
    if (templateError || !template) {
      return NextResponse.json({ error: "No matching active playbook found" }, { status: 404 })
    }

    const { data: version } = await supabase
      .from("playbook_template_versions")
      .select("id,version,status")
      .eq("template_id", template.id)
      .eq("version", template.current_version)
      .maybeSingle()

    if (!version) {
      return NextResponse.json({ error: "Current playbook version missing" }, { status: 500 })
    }

    let executionId: string | null = null
    const { data: existingExecution } = await supabase
      .from("case_playbook_executions")
      .select("id,version_id")
      .eq("case_id", id)
      .maybeSingle()

    if (existingExecution) {
      executionId = existingExecution.id
      const { error: updateError } = await supabase
        .from("case_playbook_executions")
        .update({
          template_id: template.id,
          version_id: version.id,
          strict_mode: template.strict_mode,
          status: "active",
          completed_at: null,
        })
        .eq("id", existingExecution.id)
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      if (existingExecution.version_id !== version.id) {
        await supabase
          .from("case_playbook_step_status")
          .delete()
          .eq("execution_id", existingExecution.id)
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("case_playbook_executions")
        .insert({
          case_id: id,
          template_id: template.id,
          version_id: version.id,
          strict_mode: template.strict_mode,
          started_by: user.id,
          status: "active",
        })
        .select("id")
        .single()

      if (insertError || !inserted) {
        return NextResponse.json({ error: insertError?.message ?? "Failed to bind playbook" }, { status: 500 })
      }
      executionId = inserted.id
    }

    const { data: steps } = await supabase
      .from("playbook_template_steps")
      .select("id")
      .eq("version_id", version.id)
      .order("step_order", { ascending: true })

    if ((steps ?? []).length > 0 && executionId) {
      const payload = (steps ?? []).map((step) => ({
        execution_id: executionId,
        step_id: step.id,
        status: "pending",
      }))
      const { error: statusError } = await supabase
        .from("case_playbook_step_status")
        .upsert(payload, { onConflict: "execution_id,step_id" })
      if (statusError) {
        return NextResponse.json({ error: statusError.message }, { status: 500 })
      }
    }

    await supabase
      .from("alert_cases")
      .update({
        playbook_key: template.key,
        updated_by: user.id,
      })
      .eq("id", id)

    await supabase
      .from("alert_case_activity")
      .insert({
        case_id: id,
        action: "playbook_bound",
        details: {
          templateId: template.id,
          version: template.current_version,
          strictMode: template.strict_mode,
        },
        created_by: user.id,
      })

    const state = await loadExecutionState(supabase, id)
    return NextResponse.json(state)
  }

  const { data: execution } = await supabase
    .from("case_playbook_executions")
    .select("id,version_id")
    .eq("case_id", id)
    .maybeSingle()

  if (!execution) {
    return NextResponse.json({ error: "Case has no bound playbook" }, { status: 404 })
  }

  const { data: steps } = await supabase
    .from("playbook_template_steps")
    .select("id,title")
    .eq("version_id", execution.version_id)
    .order("step_order", { ascending: true })

  const { data: tasks } = await supabase
    .from("alert_case_tasks")
    .select("title")
    .eq("case_id", id)

  const existingTitles = new Set((tasks ?? []).map((task) => String(task.title || "").trim().toLowerCase()).filter(Boolean))
  const toInsert = (steps ?? [])
    .filter((step) => !existingTitles.has(String(step.title || "").trim().toLowerCase()))
    .map((step) => ({
      case_id: id,
      title: String(step.title || "").trim(),
      created_by: user.id,
    }))

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("alert_case_tasks")
      .insert(toInsert)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  await supabase
    .from("alert_case_activity")
    .insert({
      case_id: id,
      action: "playbook_tasks_reseeded",
      details: { createdTasks: toInsert.length },
      created_by: user.id,
    })

  const state = await loadExecutionState(supabase, id)
  return NextResponse.json({
    ...state,
    reseededTasks: toInsert.length,
  })
}
