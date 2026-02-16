import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { computeEscalationTarget, computeSlaStatus } from "@/lib/cases/sla"

export const dynamic = "force-dynamic"

const workflowPhases = ["triage", "investigation", "containment", "eradication_recovery", "post_incident", "closed"] as const
const dispositions = ["true_positive", "benign_true_positive", "false_positive", "duplicate"] as const

const updateCaseSchema = z.object({
  title: z.string().min(3).max(180).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignee: z.string().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  workflowPhase: z.enum(workflowPhases).optional(),
  disposition: z.enum(dispositions).nullable().optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  businessImpact: z.string().max(4000).nullable().optional(),
  rootCause: z.string().max(8000).nullable().optional(),
  containmentSummary: z.string().max(8000).nullable().optional(),
  recoverySummary: z.string().max(8000).nullable().optional(),
  postIncidentSummary: z.string().max(8000).nullable().optional(),
})

function toCase(item: Record<string, unknown>) {
  return {
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
    workflowPhase: item.workflow_phase,
    disposition: item.disposition,
    confidenceScore: item.confidence_score,
    businessImpact: item.business_impact,
    rootCause: item.root_cause,
    containmentSummary: item.containment_summary,
    recoverySummary: item.recovery_summary,
    postIncidentSummary: item.post_incident_summary,
    resolvedAt: item.resolved_at,
    closedAt: item.closed_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    createdBy: item.created_by,
    updatedBy: item.updated_by,
  }
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0
}

async function evaluateClosureReadiness(supabase: Awaited<ReturnType<typeof createClient>>, caseId: string) {
  const [evidenceRes, actionsRes, timelineRes, hypothesesRes, linksRes] = await Promise.all([
    supabase.from("alert_case_evidence").select("id", { count: "exact", head: true }).eq("case_id", caseId),
    supabase.from("alert_case_response_actions").select("id", { count: "exact", head: true }).eq("case_id", caseId).eq("status", "completed"),
    supabase.from("alert_case_timeline_events").select("id", { count: "exact", head: true }).eq("case_id", caseId),
    supabase.from("alert_case_hypotheses").select("id", { count: "exact", head: true }).eq("case_id", caseId).in("status", ["confirmed", "rejected"]),
    supabase.from("alert_case_logs").select("log_id", { count: "exact", head: true }).eq("case_id", caseId),
  ])

  const checks = {
    hasEvidence: (evidenceRes.count ?? 0) > 0,
    hasCompletedResponseAction: (actionsRes.count ?? 0) > 0,
    hasTimelineEvents: (timelineRes.count ?? 0) > 0,
    hasHypothesisDecision: (hypothesesRes.count ?? 0) > 0,
    hasLinkedLogs: (linksRes.count ?? 0) > 0,
  }

  return {
    checks,
    readyForResolve: checks.hasEvidence && checks.hasCompletedResponseAction && checks.hasTimelineEvents,
    readyForClose: checks.hasEvidence && checks.hasCompletedResponseAction && checks.hasTimelineEvents && checks.hasHypothesisDecision && checks.hasLinkedLogs,
  }
}

export async function GET(
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

  const { data: caseRow, error: caseError } = await supabase
    .from("alert_cases")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (caseError || !caseRow) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 })
  }

  const nextSlaStatus = computeSlaStatus(caseRow.due_at)
  const nextEscalation = computeEscalationTarget(caseRow.status, caseRow.due_at)
  if (
    nextSlaStatus !== caseRow.sla_status ||
    nextEscalation.level !== caseRow.escalation_level ||
    (nextEscalation.target ?? null) !== (caseRow.escalation_target ?? null)
  ) {
    const escalatedAssignee = caseRow.assignee || (nextEscalation.target ? `Escalated to ${nextEscalation.target} queue` : null)
    const { data: refreshed } = await supabase
      .from("alert_cases")
      .update({
        sla_status: nextSlaStatus,
        escalation_level: nextEscalation.level,
        escalation_target: nextEscalation.target,
        assignee: escalatedAssignee,
        escalated_at: nextEscalation.level > 0 ? new Date().toISOString() : null,
        updated_by: user.id,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle()
    if (refreshed) {
      Object.assign(caseRow, refreshed)
    }
  }

  const [notesResult, tasksResult, evidenceResult, activityResult, hypothesesResult, responseActionsResult, timelineResult, readiness] = await Promise.all([
    supabase.from("alert_case_notes").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("alert_case_tasks").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("alert_case_evidence").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("alert_case_activity").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("alert_case_hypotheses").select("*").eq("case_id", id).order("updated_at", { ascending: false }),
    supabase.from("alert_case_response_actions").select("*").eq("case_id", id).order("updated_at", { ascending: false }),
    supabase.from("alert_case_timeline_events").select("*").eq("case_id", id).order("event_at", { ascending: true }),
    evaluateClosureReadiness(supabase, id),
  ])

  if (
    notesResult.error ||
    tasksResult.error ||
    evidenceResult.error ||
    activityResult.error ||
    hypothesesResult.error ||
    responseActionsResult.error ||
    timelineResult.error
  ) {
    return NextResponse.json({ error: "Failed to load case details" }, { status: 500 })
  }

  return NextResponse.json({
    case: toCase(caseRow),
    notes: (notesResult.data ?? []).map((item) => ({
      id: item.id,
      body: item.body,
      createdAt: item.created_at,
      createdBy: item.created_by,
    })),
    tasks: (tasksResult.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      isDone: item.is_done,
      dueAt: item.due_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      createdBy: item.created_by,
    })),
    evidence: (evidenceResult.data ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      evidenceType: item.evidence_type,
      url: item.url,
      details: item.details,
      createdAt: item.created_at,
      createdBy: item.created_by,
    })),
    activity: (activityResult.data ?? []).map((item) => ({
      id: item.id,
      action: item.action,
      details: item.details,
      createdAt: item.created_at,
      createdBy: item.created_by,
    })),
    hypotheses: (hypothesesResult.data ?? []).map((item) => ({
      id: item.id,
      statement: item.statement,
      confidence: item.confidence,
      status: item.status,
      evidenceSummary: item.evidence_summary,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
    })),
    responseActions: (responseActionsResult.data ?? []).map((item) => ({
      id: item.id,
      actionType: item.action_type,
      target: item.target,
      status: item.status,
      details: item.details,
      executedBy: item.executed_by,
      executedAt: item.executed_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      createdBy: item.created_by,
    })),
    timelineEvents: (timelineResult.data ?? []).map((item) => ({
      id: item.id,
      eventType: item.event_type,
      title: item.title,
      eventAt: item.event_at,
      details: item.details,
      createdAt: item.created_at,
      createdBy: item.created_by,
    })),
    closureReadiness: readiness,
  })
}

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

  const parsed = updateCaseSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_by: user.id }
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim()
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
  if (parsed.data.assignee !== undefined) updates.assignee = parsed.data.assignee
  if (parsed.data.assigneeUserId !== undefined) updates.assignee_user_id = parsed.data.assigneeUserId
  if (parsed.data.dueAt !== undefined) updates.due_at = parsed.data.dueAt
  if (parsed.data.workflowPhase !== undefined) updates.workflow_phase = parsed.data.workflowPhase
  if (parsed.data.disposition !== undefined) updates.disposition = parsed.data.disposition
  if (parsed.data.confidenceScore !== undefined) updates.confidence_score = parsed.data.confidenceScore
  if (parsed.data.businessImpact !== undefined) updates.business_impact = parsed.data.businessImpact
  if (parsed.data.rootCause !== undefined) updates.root_cause = parsed.data.rootCause
  if (parsed.data.containmentSummary !== undefined) updates.containment_summary = parsed.data.containmentSummary
  if (parsed.data.recoverySummary !== undefined) updates.recovery_summary = parsed.data.recoverySummary
  if (parsed.data.postIncidentSummary !== undefined) updates.post_incident_summary = parsed.data.postIncidentSummary

  if (parsed.data.assigneeUserId) {
    const { data: assigneeProfile } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", parsed.data.assigneeUserId)
      .maybeSingle()
    updates.assignee = assigneeProfile?.full_name || assigneeProfile?.email || null
  } else if (parsed.data.assigneeUserId === null && parsed.data.assignee === undefined) {
    updates.assignee = null
  }

  if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
    const readiness = await evaluateClosureReadiness(supabase, id)
    const { data: existing } = await supabase
      .from("alert_cases")
      .select("root_cause,containment_summary,recovery_summary,post_incident_summary")
      .eq("id", id)
      .maybeSingle()

    const nextRootCause = parsed.data.rootCause ?? existing?.root_cause
    const nextContainmentSummary = parsed.data.containmentSummary ?? existing?.containment_summary
    const nextRecoverySummary = parsed.data.recoverySummary ?? existing?.recovery_summary
    const nextPostIncidentSummary = parsed.data.postIncidentSummary ?? existing?.post_incident_summary

    if (!readiness.readyForResolve || !hasText(nextRootCause) || !hasText(nextContainmentSummary)) {
      return NextResponse.json({
        error: "Case is not ready to resolve. Add evidence, completed response action, timeline, root cause, and containment summary.",
        closureReadiness: readiness,
      }, { status: 400 })
    }

    if (parsed.data.status === "closed") {
      if (!readiness.readyForClose || !hasText(nextRecoverySummary) || !hasText(nextPostIncidentSummary)) {
        return NextResponse.json({
          error: "Case is not ready to close. Ensure hypothesis decision, linked logs, recovery summary, and post-incident summary exist.",
          closureReadiness: readiness,
        }, { status: 400 })
      }
    }

    if (parsed.data.status === "resolved") {
      updates.resolved_at = new Date().toISOString()
      updates.workflow_phase = parsed.data.workflowPhase ?? "post_incident"
    }
    if (parsed.data.status === "closed") {
      updates.closed_at = new Date().toISOString()
      updates.workflow_phase = "closed"
    }
  }

  const { data: updatedCase, error: updateError } = await supabase
    .from("alert_cases")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single()

  if (updateError || !updatedCase) {
    return NextResponse.json({ error: updateError?.message ?? "Case not found" }, { status: 404 })
  }

  const nextSlaStatus = computeSlaStatus(updatedCase.due_at)
  const nextEscalation = computeEscalationTarget(updatedCase.status, updatedCase.due_at)
  if (
    nextSlaStatus !== updatedCase.sla_status ||
    nextEscalation.level !== updatedCase.escalation_level ||
    (nextEscalation.target ?? null) !== (updatedCase.escalation_target ?? null)
  ) {
    const { data: synced } = await supabase
      .from("alert_cases")
      .update({
        sla_status: nextSlaStatus,
        escalation_level: nextEscalation.level,
        escalation_target: nextEscalation.target,
        escalated_at: nextEscalation.level > 0 ? new Date().toISOString() : null,
        updated_by: user.id,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle()
    if (synced) {
      updatedCase.sla_status = synced.sla_status
      updatedCase.escalation_level = synced.escalation_level
      updatedCase.escalation_target = synced.escalation_target
      updatedCase.escalated_at = synced.escalated_at
    }
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "case_updated",
    details: parsed.data,
    created_by: user.id,
  })

  return NextResponse.json({ case: toCase(updatedCase) })
}
