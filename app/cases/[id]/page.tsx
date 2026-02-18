"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useLocale, useTranslations } from "next-intl"

type CaseDetail = {
  id: string
  title: string
  status: "open" | "in_progress" | "resolved" | "closed"
  priority: "low" | "medium" | "high" | "critical"
  dueAt: string | null
  slaStatus: "on_track" | "at_risk" | "breached"
  workflowPhase: "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident" | "closed"
  disposition: "true_positive" | "benign_true_positive" | "false_positive" | "duplicate" | null
  confidenceScore: number
  businessImpact: string | null
  rootCause: string | null
  containmentSummary: string | null
  recoverySummary: string | null
  postIncidentSummary: string | null
}

type CaseTask = { id: string; title: string; isDone: boolean }
type CaseNote = { id: string; body: string; createdAt: string }
type CaseActivity = { id: string; action: string; createdAt: string }
type CaseEvidence = {
  id: string
  label: string
  evidenceType: "link" | "file" | "hash" | "ioc" | "note"
  url: string | null
  details: string | null
  filePath?: string | null
  fileSizeBytes?: number | null
  contentType?: string | null
  sha256?: string | null
  createdAt: string
}

type LinkedAlert = {
  alertId: string
  relationType: "primary" | "related_to" | "same_actor" | "same_ip" | "same_resource"
  isPrimary: boolean
  alert: { id: string; title: string; source: string; timestamp: string } | null
}

type LinkedLog = {
  logId: string
  relationType: "related_to" | "same_actor" | "same_ip" | "same_resource"
  log: { id: string; message: string; source: string; timestamp: string } | null
}

type AlertSearchItem = { id: string; title: string; source: string }
type LogSearchItem = { id: string; message: string; source: string }

type Hypothesis = {
  id: string
  statement: string
  confidence: number
  status: "open" | "confirmed" | "rejected"
}

type ResponseAction = {
  id: string
  actionType: "contain_host" | "disable_user" | "block_ip" | "block_domain" | "block_hash" | "revoke_sessions" | "isolate_resource" | "other"
  target: string
  status: "planned" | "in_progress" | "completed" | "failed" | "cancelled"
}

type TimelineEvent = {
  id: string
  eventType: "first_seen" | "detection" | "triage" | "containment" | "eradication" | "recovery" | "post_incident" | "custom"
  title: string
  eventAt: string
}

type PlaybookTemplateOption = {
  id: string
  name: string
  key: string
  currentVersion: number
  strictMode: boolean
}

type PlaybookExecutionState = {
  execution: {
    id: string
    templateId: string
    versionId: string
    strictMode: boolean
    status: "active" | "completed" | "cancelled"
    progress: {
      done: number
      total: number
      requiredDone: number
      requiredTotal: number
    }
    template: {
      id: string
      key: string
      name: string
      current_version: number
    }
  } | null
  steps: Array<{
    id: string
    order: number
    title: string
    stage: "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident"
    required: boolean
    statusId: string | null
    status: "pending" | "in_progress" | "completed" | "skipped" | "blocked"
  }>
  stageProgress: Record<"triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident", { done: number; total: number }>
}

type ClosureReadiness = {
  checks: {
    hasEvidence: boolean
    hasCompletedResponseAction: boolean
    hasTimelineEvents: boolean
    hasHypothesisDecision: boolean
    hasLinkedLogs: boolean
  }
  readyForResolve: boolean
  readyForClose: boolean
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "n/a"
  return new Date(value).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
}

export default function CaseDetailPage() {
  const t = useTranslations("pages")
  const tc = useTranslations("caseDetails")
  const locale = useLocale()
  const params = useParams<{ id: string }>()
  const caseId = String(params?.id ?? "")

  const [caseItem, setCaseItem] = useState<CaseDetail | null>(null)
  const [tasks, setTasks] = useState<CaseTask[]>([])
  const [notes, setNotes] = useState<CaseNote[]>([])
  const [evidence, setEvidence] = useState<CaseEvidence[]>([])
  const [activity, setActivity] = useState<CaseActivity[]>([])
  const [linkedAlerts, setLinkedAlerts] = useState<LinkedAlert[]>([])
  const [linkedLogs, setLinkedLogs] = useState<LinkedLog[]>([])
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [responseActions, setResponseActions] = useState<ResponseAction[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [closureReadiness, setClosureReadiness] = useState<ClosureReadiness | null>(null)
  const [playbooksEnabled, setPlaybooksEnabled] = useState(false)
  const [availablePlaybooks, setAvailablePlaybooks] = useState<PlaybookTemplateOption[]>([])
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>("")
  const [playbookState, setPlaybookState] = useState<PlaybookExecutionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [alertSearch, setAlertSearch] = useState("")
  const [logSearch, setLogSearch] = useState("")
  const [alertSearchResults, setAlertSearchResults] = useState<AlertSearchItem[]>([])
  const [logSearchResults, setLogSearchResults] = useState<LogSearchItem[]>([])
  const [relationType, setRelationType] = useState<"related_to" | "same_actor" | "same_ip" | "same_resource">("related_to")

  const [newTask, setNewTask] = useState("")
  const [newNote, setNewNote] = useState("")
  const [newEvidenceLabel, setNewEvidenceLabel] = useState("")
  const [newEvidenceType, setNewEvidenceType] = useState<CaseEvidence["evidenceType"]>("note")
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("")
  const [newEvidenceSha, setNewEvidenceSha] = useState("")
  const [newEvidenceDetails, setNewEvidenceDetails] = useState("")
  const [newHypothesis, setNewHypothesis] = useState("")
  const [newActionTarget, setNewActionTarget] = useState("")
  const [newActionType, setNewActionType] = useState<ResponseAction["actionType"]>("contain_host")
  const [newTimelineTitle, setNewTimelineTitle] = useState("")

  const [workflowDraft, setWorkflowDraft] = useState({
    workflowPhase: "triage" as CaseDetail["workflowPhase"],
    disposition: "" as "" | NonNullable<CaseDetail["disposition"]>,
    confidenceScore: 50,
    businessImpact: "",
    rootCause: "",
    containmentSummary: "",
    recoverySummary: "",
    postIncidentSummary: "",
  })

  const linkedAlertIds = useMemo(() => new Set(linkedAlerts.map((item) => item.alertId)), [linkedAlerts])
  const linkedLogIds = useMemo(() => new Set(linkedLogs.map((item) => item.logId)), [linkedLogs])
  const relationLabel = useCallback((value: "primary" | "related_to" | "same_actor" | "same_ip" | "same_resource") => tc(`relation.${value}`), [tc])
  const stageLabel = useCallback((value: "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident") => tc(`stage.${value}`), [tc])

  const loadCase = useCallback(async () => {
    setLoading(true)
    try {
      const [detailRes, alertsRes, logsRes, playbookRes, playbookListRes, flagsRes] = await Promise.all([
        fetch(`/api/cases/${caseId}`),
        fetch(`/api/cases/${caseId}/alerts`),
        fetch(`/api/cases/${caseId}/logs`),
        fetch(`/api/cases/${caseId}/playbook`),
        fetch("/api/playbooks?isActive=true"),
        fetch("/api/feature-flags"),
      ])
      if (!detailRes.ok || !alertsRes.ok || !logsRes.ok) {
        throw new Error(tc("errors.loadWorkspace"))
      }

      const detail = await detailRes.json()
      const alertsPayload = await alertsRes.json() as { alerts: LinkedAlert[] }
      const logsPayload = await logsRes.json() as { logs: LinkedLog[] }
      const playbookPayload = playbookRes.ok ? await playbookRes.json() as PlaybookExecutionState : null
      const playbookListPayload = playbookListRes.ok ? await playbookListRes.json() as { playbooks?: PlaybookTemplateOption[] } : null
      const flagsPayload = flagsRes.ok ? await flagsRes.json() as { flags?: Array<{ key: string; enabled: boolean }> } : null

      setCaseItem(detail.case)
      setTasks(detail.tasks ?? [])
      setNotes(detail.notes ?? [])
      setEvidence(detail.evidence ?? [])
      setActivity(detail.activity ?? [])
      setHypotheses(detail.hypotheses ?? [])
      setResponseActions(detail.responseActions ?? [])
      setTimelineEvents(detail.timelineEvents ?? [])
      setClosureReadiness(detail.closureReadiness ?? null)
      setPlaybookState(playbookPayload)
      const options = (playbookListPayload?.playbooks ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        key: entry.key,
        currentVersion: entry.currentVersion,
        strictMode: entry.strictMode,
      }))
      setAvailablePlaybooks(options)
      if (playbookPayload?.execution?.templateId) {
        setSelectedPlaybookId(playbookPayload.execution.templateId)
      } else if (options.length && !selectedPlaybookId) {
        setSelectedPlaybookId(options[0].id)
      }
      setPlaybooksEnabled(Boolean(flagsPayload?.flags?.some((flag) => flag.key === "experimental_playbooks" && flag.enabled)))
      setLinkedAlerts(alertsPayload.alerts ?? [])
      setLinkedLogs(logsPayload.logs ?? [])
      setWorkflowDraft({
        workflowPhase: detail.case.workflowPhase,
        disposition: (detail.case.disposition ?? "") as "" | NonNullable<CaseDetail["disposition"]>,
        confidenceScore: detail.case.confidenceScore ?? 50,
        businessImpact: detail.case.businessImpact ?? "",
        rootCause: detail.case.rootCause ?? "",
        containmentSummary: detail.case.containmentSummary ?? "",
        recoverySummary: detail.case.recoverySummary ?? "",
        postIncidentSummary: detail.case.postIncidentSummary ?? "",
      })
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : tc("errors.loadCase"))
    } finally {
      setLoading(false)
    }
  }, [caseId, selectedPlaybookId, tc])

  useEffect(() => { void loadCase() }, [loadCase])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const needle = alertSearch.trim()
      if (!needle) return setAlertSearchResults([])
      const res = await fetch(`/api/alerts?page=1&pageSize=15&type=all&search=${encodeURIComponent(needle)}`).catch(() => null)
      if (!res?.ok) return
      const payload = await res.json() as { alerts: AlertSearchItem[] }
      setAlertSearchResults(payload.alerts ?? [])
    }, 250)
    return () => clearTimeout(timer)
  }, [alertSearch])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const needle = logSearch.trim()
      if (!needle) return setLogSearchResults([])
      const res = await fetch(`/api/logs?page=1&pageSize=15&search=${encodeURIComponent(needle)}`).catch(() => null)
      if (!res?.ok) return
      const payload = await res.json() as { logs: LogSearchItem[] }
      setLogSearchResults(payload.logs ?? [])
    }, 250)
    return () => clearTimeout(timer)
  }, [logSearch])

  const patchCase = useCallback(async (updates: Record<string, unknown>) => {
    const res = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    const payload = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) {
      setError(payload.error ?? tc("errors.updateCase"))
      return
    }
    await loadCase()
  }, [caseId, loadCase, tc])

  const postJson = useCallback(async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (res.ok) await loadCase()
  }, [loadCase])

  const bindPlaybook = useCallback(async () => {
    const payload: Record<string, unknown> = { action: "bind" }
    if (selectedPlaybookId) {
      payload.templateId = selectedPlaybookId
    }
    const res = await fetch(`/api/cases/${caseId}/playbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      await loadCase()
    }
  }, [caseId, loadCase, selectedPlaybookId])

  const reseedPlaybookTasks = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}/playbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reseed" }),
    })
    if (res.ok) {
      await loadCase()
    }
  }, [caseId, loadCase])

  const setPlaybookStepStatus = useCallback(async (statusId: string, status: "pending" | "in_progress" | "completed" | "skipped" | "blocked") => {
    const res = await fetch(`/api/cases/${caseId}/playbook/steps/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      await loadCase()
    }
  }, [caseId, loadCase])

  if (loading) return <DashboardLayout><AppHeader title={t("caseDetails")} /><div className="p-6 text-sm text-muted-foreground">{tc("loadingCase")}</div></DashboardLayout>
  if (error || !caseItem) return <DashboardLayout><AppHeader title={t("caseDetails")} /><div className="p-6 text-sm text-destructive">{error ?? tc("caseNotFound")}</div></DashboardLayout>

  return (
    <DashboardLayout>
      <AppHeader title={tc("caseTitle", { id: caseItem.id.slice(0, 8) })} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{caseItem.title}</CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/board?caseId=${encodeURIComponent(caseItem.id)}&seed=1`}>{tc("openInBoard")}</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-muted-foreground">{tc("status")}</div><Select value={caseItem.status} onValueChange={(v) => void patchCase({ status: v })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">{tc("statusValue.open")}</SelectItem><SelectItem value="in_progress">{tc("statusValue.in_progress")}</SelectItem><SelectItem value="resolved">{tc("statusValue.resolved")}</SelectItem><SelectItem value="closed">{tc("statusValue.closed")}</SelectItem></SelectContent></Select></div>
              <div><div className="text-muted-foreground">{tc("priority")}</div><Select value={caseItem.priority} onValueChange={(v) => void patchCase({ priority: v })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">{tc("priorityValue.low")}</SelectItem><SelectItem value="medium">{tc("priorityValue.medium")}</SelectItem><SelectItem value="high">{tc("priorityValue.high")}</SelectItem><SelectItem value="critical">{tc("priorityValue.critical")}</SelectItem></SelectContent></Select></div>
              <div><div className="text-muted-foreground">{tc("sla")}</div><Badge variant="outline" className="mt-2">{tc(`slaStatus.${caseItem.slaStatus}`)}</Badge></div>
              <div><div className="text-muted-foreground">{tc("due")}</div><div className="mt-2 font-medium">{formatDate(caseItem.dueAt, locale)}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{tc("workflow.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <Select value={workflowDraft.workflowPhase} onValueChange={(v) => setWorkflowDraft((c) => ({ ...c, workflowPhase: v as CaseDetail["workflowPhase"] }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="triage">{stageLabel("triage")}</SelectItem><SelectItem value="investigation">{stageLabel("investigation")}</SelectItem><SelectItem value="containment">{stageLabel("containment")}</SelectItem><SelectItem value="eradication_recovery">{stageLabel("eradication_recovery")}</SelectItem><SelectItem value="post_incident">{stageLabel("post_incident")}</SelectItem><SelectItem value="closed">{tc("statusValue.closed")}</SelectItem></SelectContent></Select>
                <Select value={workflowDraft.disposition || "none"} onValueChange={(v) => setWorkflowDraft((c) => ({ ...c, disposition: v === "none" ? "" : v as typeof c.disposition }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{tc("workflow.disposition")}</SelectItem><SelectItem value="true_positive">{tc("workflow.dispositionValue.true_positive")}</SelectItem><SelectItem value="benign_true_positive">{tc("workflow.dispositionValue.benign_true_positive")}</SelectItem><SelectItem value="false_positive">{tc("workflow.dispositionValue.false_positive")}</SelectItem><SelectItem value="duplicate">{tc("workflow.dispositionValue.duplicate")}</SelectItem></SelectContent></Select>
                <Input type="number" min={0} max={100} value={workflowDraft.confidenceScore} onChange={(e) => setWorkflowDraft((c) => ({ ...c, confidenceScore: Number(e.target.value || 0) }))} className="h-8" />
              </div>
              <Textarea value={workflowDraft.businessImpact} onChange={(e) => setWorkflowDraft((c) => ({ ...c, businessImpact: e.target.value }))} placeholder={tc("workflow.businessImpact")} className="min-h-[60px]" />
              <Textarea value={workflowDraft.rootCause} onChange={(e) => setWorkflowDraft((c) => ({ ...c, rootCause: e.target.value }))} placeholder={tc("workflow.rootCause")} className="min-h-[60px]" />
              <Textarea value={workflowDraft.containmentSummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, containmentSummary: e.target.value }))} placeholder={tc("workflow.containmentSummary")} className="min-h-[60px]" />
              <Textarea value={workflowDraft.recoverySummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, recoverySummary: e.target.value }))} placeholder={tc("workflow.recoverySummary")} className="min-h-[60px]" />
              <Textarea value={workflowDraft.postIncidentSummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, postIncidentSummary: e.target.value }))} placeholder={tc("workflow.postIncidentSummary")} className="min-h-[60px]" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void patchCase({
                  workflowPhase: workflowDraft.workflowPhase,
                  disposition: workflowDraft.disposition || null,
                  confidenceScore: workflowDraft.confidenceScore,
                  businessImpact: workflowDraft.businessImpact || null,
                  rootCause: workflowDraft.rootCause || null,
                  containmentSummary: workflowDraft.containmentSummary || null,
                  recoverySummary: workflowDraft.recoverySummary || null,
                  postIncidentSummary: workflowDraft.postIncidentSummary || null,
                })}>{tc("workflow.save")}</Button>
                <Button size="sm" onClick={() => void patchCase({ status: "resolved" })}>{tc("workflow.resolve")}</Button>
                <Button size="sm" variant="secondary" onClick={() => void patchCase({ status: "closed" })}>{tc("workflow.close")}</Button>
              </div>
              {closureReadiness ? (
                <div className="flex flex-wrap gap-1">
                  <Badge variant={closureReadiness.checks.hasEvidence ? "default" : "outline"}>{tc("workflow.readiness.evidence")}</Badge>
                  <Badge variant={closureReadiness.checks.hasCompletedResponseAction ? "default" : "outline"}>{tc("workflow.readiness.response")}</Badge>
                  <Badge variant={closureReadiness.checks.hasTimelineEvents ? "default" : "outline"}>{tc("workflow.readiness.timeline")}</Badge>
                  <Badge variant={closureReadiness.checks.hasHypothesisDecision ? "default" : "outline"}>{tc("workflow.readiness.hypothesis")}</Badge>
                  <Badge variant={closureReadiness.checks.hasLinkedLogs ? "default" : "outline"}>{tc("workflow.readiness.logsLinked")}</Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {playbooksEnabled ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{tc("playbook.title")}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={selectedPlaybookId} onValueChange={setSelectedPlaybookId}>
                    <SelectTrigger className="h-8 w-64"><SelectValue placeholder={tc("playbook.selectTemplate")} /></SelectTrigger>
                    <SelectContent>
                      {availablePlaybooks.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => void bindPlaybook()}>{tc("playbook.bind")}</Button>
                  <Button size="sm" variant="outline" onClick={() => void reseedPlaybookTasks()}>{tc("playbook.reseed")}</Button>
                </div>

                {playbookState?.execution ? (
                  <div className="space-y-2 rounded border border-border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{playbookState.execution.template.name}</Badge>
                      <Badge variant="outline">v{playbookState.execution.template.current_version}</Badge>
                      <Badge variant={playbookState.execution.strictMode ? "default" : "outline"}>
                        {playbookState.execution.strictMode ? tc("playbook.strictMode") : tc("playbook.standardMode")}
                      </Badge>
                      <Badge variant="secondary">
                        {tc("playbook.stepsProgress", { done: playbookState.execution.progress.done, total: playbookState.execution.progress.total })}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(playbookState.stageProgress).map(([stage, info]) => (
                        <Badge key={stage} variant={info.total > 0 && info.done === info.total ? "default" : "outline"}>
                          {stageLabel(stage as keyof PlaybookExecutionState["stageProgress"])} {info.done}/{info.total}
                        </Badge>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {playbookState.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{step.order}. {step.title}</div>
                            <div className="text-muted-foreground">{stageLabel(step.stage)}{step.required ? ` - ${tc("playbook.required")}` : ` - ${tc("playbook.optional")}`}</div>
                          </div>
                          <Select
                            value={step.status}
                            onValueChange={(value) => {
                              if (!step.statusId) return
                              void setPlaybookStepStatus(step.statusId, value as "pending" | "in_progress" | "completed" | "skipped" | "blocked")
                            }}
                          >
                            <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">{tc("playbook.stepStatus.pending")}</SelectItem>
                              <SelectItem value="in_progress">{tc("playbook.stepStatus.in_progress")}</SelectItem>
                              <SelectItem value="completed">{tc("playbook.stepStatus.completed")}</SelectItem>
                              <SelectItem value="skipped">{tc("playbook.stepStatus.skipped")}</SelectItem>
                              <SelectItem value="blocked">{tc("playbook.stepStatus.blocked")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">{tc("playbook.noneBound")}</div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("relatedAlerts")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
            <div className="flex gap-2"><Input value={alertSearch} onChange={(e) => setAlertSearch(e.target.value)} placeholder={tc("searchAlerts")} className="h-8" /><Select value={relationType} onValueChange={(v) => setRelationType(v as typeof relationType)}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="related_to">{relationLabel("related_to")}</SelectItem><SelectItem value="same_actor">{relationLabel("same_actor")}</SelectItem><SelectItem value="same_ip">{relationLabel("same_ip")}</SelectItem><SelectItem value="same_resource">{relationLabel("same_resource")}</SelectItem></SelectContent></Select></div>
            {alertSearchResults.filter((a) => !linkedAlertIds.has(a.id)).slice(0, 5).map((a) => <div key={a.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{a.title}</div><div className="text-muted-foreground">{a.id}</div></div><Button size="sm" variant="outline" className="h-7" onClick={() => void postJson(`/api/cases/${caseId}/alerts`, { alertId: a.id, relationType })}>{tc("add")}</Button></div>)}
            {linkedAlerts.map((a) => <div key={a.alertId} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{a.alert?.title ?? a.alertId}</div><div className="text-muted-foreground">{a.alertId} - {formatDate(a.alert?.timestamp, locale)}</div></div><Badge variant="outline">{relationLabel(a.relationType)}</Badge>{!a.isPrimary ? <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={async () => { await fetch(`/api/cases/${caseId}/alerts?alertId=${encodeURIComponent(a.alertId)}`, { method: "DELETE" }); await loadCase() }}>{tc("remove")}</Button> : null}</div>)}
          </CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("relatedLogs")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
            <Input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder={tc("searchLogs")} className="h-8" />
            {logSearchResults.filter((l) => !linkedLogIds.has(l.id)).slice(0, 5).map((l) => <div key={l.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{l.message || l.id}</div><div className="text-muted-foreground">{l.id}</div></div><Button size="sm" variant="outline" className="h-7" onClick={() => void postJson(`/api/cases/${caseId}/logs`, { logId: l.id, relationType })}>{tc("add")}</Button></div>)}
            {linkedLogs.map((l) => <div key={l.logId} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{l.log?.message || l.logId}</div><div className="text-muted-foreground">{l.logId} - {formatDate(l.log?.timestamp, locale)}</div></div><Badge variant="outline">{relationLabel(l.relationType)}</Badge><Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={async () => { await fetch(`/api/cases/${caseId}/logs?logId=${encodeURIComponent(l.logId)}`, { method: "DELETE" }); await loadCase() }}>{tc("remove")}</Button></div>)}
          </CardContent></Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("tasks")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><div className="flex gap-2"><Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={tc("addTask")} className="h-8" /><Button size="sm" className="h-8" onClick={() => void postJson(`/api/cases/${caseId}/tasks`, { title: newTask })}>{tc("add")}</Button></div>{tasks.map((t) => <div key={t.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><Checkbox checked={t.isDone} onCheckedChange={async (checked) => { await fetch(`/api/cases/${caseId}/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDone: Boolean(checked) }) }); await loadCase() }} /><span className={t.isDone ? "line-through text-muted-foreground" : ""}>{t.title}</span></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("notes")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={tc("investigationNote")} className="min-h-[80px]" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/notes`, { body: newNote })}>{tc("addNote")}</Button>{notes.map((n) => <div key={n.id} className="rounded border border-border px-2 py-1"><div>{n.body}</div><div className="text-muted-foreground">{formatDate(n.createdAt, locale)}</div></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("evidence")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><div className="grid grid-cols-1 gap-2"><Input value={newEvidenceLabel} onChange={(e) => setNewEvidenceLabel(e.target.value)} placeholder={tc("evidenceLabel")} className="h-8" /><Select value={newEvidenceType} onValueChange={(v) => setNewEvidenceType(v as CaseEvidence["evidenceType"])}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="note">{tc("evidenceType.note")}</SelectItem><SelectItem value="link">{tc("evidenceType.link")}</SelectItem><SelectItem value="file">{tc("evidenceType.file")}</SelectItem><SelectItem value="hash">{tc("evidenceType.hash")}</SelectItem><SelectItem value="ioc">{tc("evidenceType.ioc")}</SelectItem></SelectContent></Select><Input value={newEvidenceUrl} onChange={(e) => setNewEvidenceUrl(e.target.value)} placeholder={tc("optionalUrl")} className="h-8" /><Input value={newEvidenceSha} onChange={(e) => setNewEvidenceSha(e.target.value)} placeholder={tc("optionalSha")} className="h-8 font-mono" /><Textarea value={newEvidenceDetails} onChange={(e) => setNewEvidenceDetails(e.target.value)} placeholder={tc("details")} className="min-h-[70px]" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/evidence`, { label: newEvidenceLabel, evidenceType: newEvidenceType, url: newEvidenceUrl || null, sha256: newEvidenceSha || null, details: newEvidenceDetails || null })}>{tc("addEvidence")}</Button></div>{evidence.map((item) => <div key={item.id} className="rounded border border-border px-2 py-1"><div className="flex items-center gap-2"><span className="font-medium">{item.label}</span><Badge variant="outline">{tc(`evidenceType.${item.evidenceType}`)}</Badge></div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="block truncate text-primary underline-offset-2 hover:underline">{item.url}</a> : null}{item.sha256 ? <div className="truncate font-mono text-[10px] text-muted-foreground">{item.sha256}</div> : null}{item.details ? <div className="mt-1 text-muted-foreground">{item.details}</div> : null}</div>)}</CardContent></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("hypotheses")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Input value={newHypothesis} onChange={(e) => setNewHypothesis(e.target.value)} placeholder={tc("hypothesis")} className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/hypotheses`, { statement: newHypothesis, confidence: 50, status: "open" })}>{tc("add")}</Button>{hypotheses.map((h) => <div key={h.id} className="rounded border border-border px-2 py-1"><div>{h.statement}</div><div className="mt-1 flex gap-1"><Badge variant="outline">{tc(`hypothesisStatus.${h.status}`)}</Badge><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/hypotheses/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }) }); await loadCase() }}>{tc("confirm")}</Button><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/hypotheses/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }); await loadCase() }}>{tc("reject")}</Button></div></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("responseActions")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Select value={newActionType} onValueChange={(v) => setNewActionType(v as ResponseAction["actionType"])}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contain_host">{tc("actionType.contain_host")}</SelectItem><SelectItem value="disable_user">{tc("actionType.disable_user")}</SelectItem><SelectItem value="block_ip">{tc("actionType.block_ip")}</SelectItem><SelectItem value="block_domain">{tc("actionType.block_domain")}</SelectItem><SelectItem value="block_hash">{tc("actionType.block_hash")}</SelectItem><SelectItem value="revoke_sessions">{tc("actionType.revoke_sessions")}</SelectItem><SelectItem value="isolate_resource">{tc("actionType.isolate_resource")}</SelectItem><SelectItem value="other">{tc("actionType.other")}</SelectItem></SelectContent></Select><Input value={newActionTarget} onChange={(e) => setNewActionTarget(e.target.value)} placeholder={tc("target")} className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/response-actions`, { actionType: newActionType, target: newActionTarget, status: "planned" })}>{tc("add")}</Button>{responseActions.map((a) => <div key={a.id} className="rounded border border-border px-2 py-1"><div>{tc(`actionType.${a.actionType}`)} - {a.target}</div><div className="mt-1 flex gap-1"><Badge variant="outline">{tc(`responseStatus.${a.status}`)}</Badge><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/response-actions/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) }); await loadCase() }}>{tc("complete")}</Button></div></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("timeline")}</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Input value={newTimelineTitle} onChange={(e) => setNewTimelineTitle(e.target.value)} placeholder={tc("timelineEventTitle")} className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/timeline`, { eventType: "custom", title: newTimelineTitle, eventAt: new Date().toISOString() })}>{tc("add")}</Button>{timelineEvents.map((ev) => <div key={ev.id} className="rounded border border-border px-2 py-1"><div>{ev.title}</div><div className="text-muted-foreground">{tc(`timelineType.${ev.eventType}`)} - {formatDate(ev.eventAt, locale)}</div></div>)}</CardContent></Card>
          </div>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tc("activity")}</CardTitle></CardHeader><CardContent className="space-y-1">{activity.map((entry) => <div key={entry.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{entry.action.replace(/_/g, " ")}</span> - {formatDate(entry.createdAt, locale)}</div>)}</CardContent></Card>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
