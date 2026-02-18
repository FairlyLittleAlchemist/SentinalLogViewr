import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { computeDueAt, computeEscalationTarget, computeSlaStatus } from "@/lib/cases/sla"
import { getPlaybookForAlertType } from "@/lib/cases/playbooks"
import { hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const createCaseSchema = z.object({
  alertId: z.string().min(1),
  title: z.string().min(3).max(180).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  assignee: z.string().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  playbookId: z.string().uuid().nullable().optional(),
})

async function syncCaseEscalations(supabase: Awaited<ReturnType<typeof createClient>>, actorId: string) {
  const { data: activeCases, error } = await supabase
    .from("alert_cases")
    .select("id,status,due_at,sla_status,escalation_level,escalation_target,assignee")
    .in("status", ["open", "in_progress"])
    .not("due_at", "is", null)

  if (error || !activeCases?.length) return

  for (const item of activeCases) {
    const nextSlaStatus = computeSlaStatus(item.due_at)
    const nextEscalation = computeEscalationTarget(item.status, item.due_at)
    const needsUpdate =
      nextSlaStatus !== item.sla_status ||
      nextEscalation.level !== item.escalation_level ||
      (nextEscalation.target ?? null) !== (item.escalation_target ?? null)

    if (!needsUpdate) continue

    const escalationAssignee = (
      item.assignee ||
      (nextEscalation.target ? `Escalated to ${nextEscalation.target} queue` : null)
    )

    const { error: updateError } = await supabase
      .from("alert_cases")
      .update({
        sla_status: nextSlaStatus,
        escalation_level: nextEscalation.level,
        escalation_target: nextEscalation.target,
        assignee: escalationAssignee,
        escalated_at: nextEscalation.level > 0 ? new Date().toISOString() : null,
        updated_by: actorId,
      })
      .eq("id", item.id)

    if (!updateError && nextEscalation.level > item.escalation_level) {
      await supabase.from("alert_case_activity").insert({
        case_id: item.id,
        action: "auto_escalated",
        details: {
          level: nextEscalation.level,
          target: nextEscalation.target,
          slaStatus: nextSlaStatus,
        },
        created_by: actorId,
      })
    }
  }
}

async function getCurrentUserRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  return String(data?.role ?? "").toLowerCase()
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await syncCaseEscalations(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get("alertId")

  let query = supabase
    .from("alert_cases")
    .select("*")
    .order("created_at", { ascending: false })

  if (alertId) {
    query = query.eq("alert_id", alertId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const cases = (data ?? []).map((item) => ({
    id: item.id,
    alertId: item.alert_id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    alertType: item.alert_type,
    alertSeverity: item.alert_severity,
    playbookKey: item.playbook_key,
    assignee: item.assignee,
    assigneeUserId: item.assignee_user_id,
    dueAt: item.due_at,
    slaStatus: item.sla_status,
    escalationLevel: item.escalation_level,
    escalationTarget: item.escalation_target,
    escalatedAt: item.escalated_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    createdBy: item.created_by,
    updatedBy: item.updated_by,
  }))

  return NextResponse.json({ cases })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = await getCurrentUserRole(supabase, user.id)
  if (!(await hasPermission(supabase, user, role, "cases.create"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.create" }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = createCaseSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid case payload" }, { status: 400 })
  }

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("id,title,type,severity")
    .eq("id", parsed.data.alertId)
    .maybeSingle()

  if (alertError || !alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  let resolvedAssignee = parsed.data.assignee ?? null
  if (parsed.data.assigneeUserId) {
    const { data: assigneeProfile } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", parsed.data.assigneeUserId)
      .maybeSingle()
    resolvedAssignee = assigneeProfile?.full_name || assigneeProfile?.email || resolvedAssignee
  }

  const fallbackPlaybook = getPlaybookForAlertType(alert.type)
  let playbookQuery = supabase
    .from("playbook_templates")
    .select("id,key,current_version,strict_mode,sla_target_minutes")
    .eq("is_active", true)
    .limit(1)

  if (parsed.data.playbookId) {
    playbookQuery = playbookQuery.eq("id", parsed.data.playbookId)
  } else {
    playbookQuery = playbookQuery
      .eq("alert_type", alert.type ?? "")
      .order("updated_at", { ascending: false })
  }

  const { data: templatePlaybook } = await playbookQuery.maybeSingle()

  if (parsed.data.playbookId && !templatePlaybook) {
    return NextResponse.json({ error: "Selected playbook is not available" }, { status: 400 })
  }

  const playbook = {
    key: templatePlaybook?.key ?? fallbackPlaybook.key,
    tasks: fallbackPlaybook.tasks,
  }
  const dueAt = computeDueAt(parsed.data.priority)
  const slaStatus = computeSlaStatus(dueAt)

  const caseTitle = parsed.data.title?.trim() || `Case for ${alert.title}`
  const { data: createdCase, error: caseError } = await supabase
    .from("alert_cases")
    .insert({
      alert_id: parsed.data.alertId,
      title: caseTitle,
      priority: parsed.data.priority,
      alert_type: alert.type ?? null,
      alert_severity: alert.severity ?? null,
      playbook_key: playbook.key,
      assignee: resolvedAssignee,
      assignee_user_id: parsed.data.assigneeUserId ?? null,
      due_at: dueAt,
      sla_status: slaStatus,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single()

  if (caseError || !createdCase) {
    const code = String(caseError?.code ?? "")
    if (code === "42501") {
      return NextResponse.json({ error: "Forbidden: case create blocked by policy" }, { status: 403 })
    }
    if (code === "42703" || code === "42P01") {
      return NextResponse.json({ error: "Case schema is out of date. Run latest migrations." }, { status: 500 })
    }
    return NextResponse.json({ error: caseError?.message ?? "Failed to create case" }, { status: 500 })
  }

  if (templatePlaybook) {
    const { data: version } = await supabase
      .from("playbook_template_versions")
      .select("id,version")
      .eq("template_id", templatePlaybook.id)
      .eq("version", templatePlaybook.current_version)
      .maybeSingle()

    if (version) {
      const { data: execution } = await supabase
        .from("case_playbook_executions")
        .insert({
          case_id: createdCase.id,
          template_id: templatePlaybook.id,
          version_id: version.id,
          strict_mode: templatePlaybook.strict_mode,
          started_by: user.id,
        })
        .select("id")
        .single()

      const { data: steps } = await supabase
        .from("playbook_template_steps")
        .select("id,title")
        .eq("version_id", version.id)
        .order("step_order", { ascending: true })

      if (execution && (steps ?? []).length > 0) {
        await supabase
          .from("case_playbook_step_status")
          .insert((steps ?? []).map((step) => ({
            execution_id: execution.id,
            step_id: step.id,
            status: "pending",
          })))

        await supabase
          .from("alert_case_tasks")
          .insert((steps ?? []).map((step) => ({
            case_id: createdCase.id,
            title: step.title,
            created_by: user.id,
          })))
      }
    }
  } else if (playbook.tasks.length > 0) {
    const tasksPayload = playbook.tasks.map((taskTitle) => ({
      case_id: createdCase.id,
      title: taskTitle,
      created_by: user.id,
    }))
    await supabase.from("alert_case_tasks").insert(tasksPayload)
  }

  await supabase.from("alert_case_activity").insert({
    case_id: createdCase.id,
    action: "case_created",
    details: {
      alertId: parsed.data.alertId,
      priority: parsed.data.priority,
      assignee: resolvedAssignee,
      assigneeUserId: parsed.data.assigneeUserId ?? null,
      playbookKey: playbook.key,
      dueAt,
      slaStatus,
    },
    created_by: user.id,
  })

  await supabase
    .from("alert_case_alerts")
    .upsert({
      case_id: createdCase.id,
      alert_id: parsed.data.alertId,
      relation_type: "primary",
      is_primary: true,
      created_by: user.id,
    }, {
      onConflict: "case_id,alert_id",
    })

  return NextResponse.json({
    case: {
      id: createdCase.id,
      alertId: createdCase.alert_id,
      title: createdCase.title,
      status: createdCase.status,
      priority: createdCase.priority,
      assignee: createdCase.assignee,
      assigneeUserId: createdCase.assignee_user_id,
      alertType: createdCase.alert_type,
      alertSeverity: createdCase.alert_severity,
      playbookKey: createdCase.playbook_key,
      dueAt: createdCase.due_at,
      slaStatus: createdCase.sla_status,
      escalationLevel: createdCase.escalation_level,
      escalationTarget: createdCase.escalation_target,
      escalatedAt: createdCase.escalated_at,
      createdAt: createdCase.created_at,
      updatedAt: createdCase.updated_at,
      createdBy: createdCase.created_by,
      updatedBy: createdCase.updated_by,
    },
  })
}
