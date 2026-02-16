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

function formatDate(value: string | null | undefined) {
  if (!value) return "n/a"
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
}

const relationLabel: Record<"primary" | "related_to" | "same_actor" | "same_ip" | "same_resource", string> = {
  primary: "Primary",
  related_to: "Related",
  same_actor: "Same actor",
  same_ip: "Same IP",
  same_resource: "Same resource",
}

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>()
  const caseId = String(params?.id ?? "")

  const [caseItem, setCaseItem] = useState<CaseDetail | null>(null)
  const [tasks, setTasks] = useState<CaseTask[]>([])
  const [notes, setNotes] = useState<CaseNote[]>([])
  const [activity, setActivity] = useState<CaseActivity[]>([])
  const [linkedAlerts, setLinkedAlerts] = useState<LinkedAlert[]>([])
  const [linkedLogs, setLinkedLogs] = useState<LinkedLog[]>([])
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [responseActions, setResponseActions] = useState<ResponseAction[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [closureReadiness, setClosureReadiness] = useState<ClosureReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [alertSearch, setAlertSearch] = useState("")
  const [logSearch, setLogSearch] = useState("")
  const [alertSearchResults, setAlertSearchResults] = useState<AlertSearchItem[]>([])
  const [logSearchResults, setLogSearchResults] = useState<LogSearchItem[]>([])
  const [relationType, setRelationType] = useState<"related_to" | "same_actor" | "same_ip" | "same_resource">("related_to")

  const [newTask, setNewTask] = useState("")
  const [newNote, setNewNote] = useState("")
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

  const loadCase = useCallback(async () => {
    setLoading(true)
    try {
      const [detailRes, alertsRes, logsRes] = await Promise.all([
        fetch(`/api/cases/${caseId}`),
        fetch(`/api/cases/${caseId}/alerts`),
        fetch(`/api/cases/${caseId}/logs`),
      ])
      if (!detailRes.ok || !alertsRes.ok || !logsRes.ok) {
        throw new Error("Failed to load case workspace")
      }

      const detail = await detailRes.json()
      const alertsPayload = await alertsRes.json() as { alerts: LinkedAlert[] }
      const logsPayload = await logsRes.json() as { logs: LinkedLog[] }

      setCaseItem(detail.case)
      setTasks(detail.tasks ?? [])
      setNotes(detail.notes ?? [])
      setActivity(detail.activity ?? [])
      setHypotheses(detail.hypotheses ?? [])
      setResponseActions(detail.responseActions ?? [])
      setTimelineEvents(detail.timelineEvents ?? [])
      setClosureReadiness(detail.closureReadiness ?? null)
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load case")
    } finally {
      setLoading(false)
    }
  }, [caseId])

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
      setError(payload.error ?? "Case update failed")
      return
    }
    await loadCase()
  }, [caseId, loadCase])

  const postJson = useCallback(async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (res.ok) await loadCase()
  }, [loadCase])

  if (loading) return <DashboardLayout><AppHeader title="Case Details" /><div className="p-6 text-sm text-muted-foreground">Loading case...</div></DashboardLayout>
  if (error || !caseItem) return <DashboardLayout><AppHeader title="Case Details" /><div className="p-6 text-sm text-destructive">{error ?? "Case not found"}</div></DashboardLayout>

  return (
    <DashboardLayout>
      <AppHeader title={`Case ${caseItem.id.slice(0, 8)}`} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{caseItem.title}</CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/board?caseId=${encodeURIComponent(caseItem.id)}&seed=1`}>Open In Board</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-muted-foreground">Status</div><Select value={caseItem.status} onValueChange={(v) => void patchCase({ status: v })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
              <div><div className="text-muted-foreground">Priority</div><Select value={caseItem.priority} onValueChange={(v) => void patchCase({ priority: v })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              <div><div className="text-muted-foreground">SLA</div><Badge variant="outline" className="mt-2">{caseItem.slaStatus.replace("_", " ")}</Badge></div>
              <div><div className="text-muted-foreground">Due</div><div className="mt-2 font-medium">{formatDate(caseItem.dueAt)}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">SOC Workflow</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <Select value={workflowDraft.workflowPhase} onValueChange={(v) => setWorkflowDraft((c) => ({ ...c, workflowPhase: v as CaseDetail["workflowPhase"] }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="triage">Triage</SelectItem><SelectItem value="investigation">Investigation</SelectItem><SelectItem value="containment">Containment</SelectItem><SelectItem value="eradication_recovery">Eradication & Recovery</SelectItem><SelectItem value="post_incident">Post Incident</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
                <Select value={workflowDraft.disposition || "none"} onValueChange={(v) => setWorkflowDraft((c) => ({ ...c, disposition: v === "none" ? "" : v as typeof c.disposition }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Disposition</SelectItem><SelectItem value="true_positive">True Positive</SelectItem><SelectItem value="benign_true_positive">Benign TP</SelectItem><SelectItem value="false_positive">False Positive</SelectItem><SelectItem value="duplicate">Duplicate</SelectItem></SelectContent></Select>
                <Input type="number" min={0} max={100} value={workflowDraft.confidenceScore} onChange={(e) => setWorkflowDraft((c) => ({ ...c, confidenceScore: Number(e.target.value || 0) }))} className="h-8" />
              </div>
              <Textarea value={workflowDraft.businessImpact} onChange={(e) => setWorkflowDraft((c) => ({ ...c, businessImpact: e.target.value }))} placeholder="Business impact" className="min-h-[60px]" />
              <Textarea value={workflowDraft.rootCause} onChange={(e) => setWorkflowDraft((c) => ({ ...c, rootCause: e.target.value }))} placeholder="Root cause" className="min-h-[60px]" />
              <Textarea value={workflowDraft.containmentSummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, containmentSummary: e.target.value }))} placeholder="Containment summary" className="min-h-[60px]" />
              <Textarea value={workflowDraft.recoverySummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, recoverySummary: e.target.value }))} placeholder="Recovery summary" className="min-h-[60px]" />
              <Textarea value={workflowDraft.postIncidentSummary} onChange={(e) => setWorkflowDraft((c) => ({ ...c, postIncidentSummary: e.target.value }))} placeholder="Post-incident summary" className="min-h-[60px]" />
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
                })}>Save Workflow</Button>
                <Button size="sm" onClick={() => void patchCase({ status: "resolved" })}>Resolve</Button>
                <Button size="sm" variant="secondary" onClick={() => void patchCase({ status: "closed" })}>Close</Button>
              </div>
              {closureReadiness ? (
                <div className="flex flex-wrap gap-1">
                  <Badge variant={closureReadiness.checks.hasEvidence ? "default" : "outline"}>Evidence</Badge>
                  <Badge variant={closureReadiness.checks.hasCompletedResponseAction ? "default" : "outline"}>Response</Badge>
                  <Badge variant={closureReadiness.checks.hasTimelineEvents ? "default" : "outline"}>Timeline</Badge>
                  <Badge variant={closureReadiness.checks.hasHypothesisDecision ? "default" : "outline"}>Hypothesis</Badge>
                  <Badge variant={closureReadiness.checks.hasLinkedLogs ? "default" : "outline"}>Logs linked</Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Related Alerts</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
            <div className="flex gap-2"><Input value={alertSearch} onChange={(e) => setAlertSearch(e.target.value)} placeholder="Search alerts" className="h-8" /><Select value={relationType} onValueChange={(v) => setRelationType(v as typeof relationType)}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="related_to">Related</SelectItem><SelectItem value="same_actor">Same actor</SelectItem><SelectItem value="same_ip">Same IP</SelectItem><SelectItem value="same_resource">Same resource</SelectItem></SelectContent></Select></div>
            {alertSearchResults.filter((a) => !linkedAlertIds.has(a.id)).slice(0, 5).map((a) => <div key={a.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{a.title}</div><div className="text-muted-foreground">{a.id}</div></div><Button size="sm" variant="outline" className="h-7" onClick={() => void postJson(`/api/cases/${caseId}/alerts`, { alertId: a.id, relationType })}>Add</Button></div>)}
            {linkedAlerts.map((a) => <div key={a.alertId} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{a.alert?.title ?? a.alertId}</div><div className="text-muted-foreground">{a.alertId} - {formatDate(a.alert?.timestamp)}</div></div><Badge variant="outline">{relationLabel[a.relationType]}</Badge>{!a.isPrimary ? <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={async () => { await fetch(`/api/cases/${caseId}/alerts?alertId=${encodeURIComponent(a.alertId)}`, { method: "DELETE" }); await loadCase() }}>Remove</Button> : null}</div>)}
          </CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Related Logs</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
            <Input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Search logs" className="h-8" />
            {logSearchResults.filter((l) => !linkedLogIds.has(l.id)).slice(0, 5).map((l) => <div key={l.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{l.message || l.id}</div><div className="text-muted-foreground">{l.id}</div></div><Button size="sm" variant="outline" className="h-7" onClick={() => void postJson(`/api/cases/${caseId}/logs`, { logId: l.id, relationType })}>Add</Button></div>)}
            {linkedLogs.map((l) => <div key={l.logId} className="flex items-center gap-2 rounded border border-border px-2 py-1"><div className="min-w-0 flex-1"><div className="truncate">{l.log?.message || l.logId}</div><div className="text-muted-foreground">{l.logId} - {formatDate(l.log?.timestamp)}</div></div><Badge variant="outline">{relationLabel[l.relationType]}</Badge><Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={async () => { await fetch(`/api/cases/${caseId}/logs?logId=${encodeURIComponent(l.logId)}`, { method: "DELETE" }); await loadCase() }}>Remove</Button></div>)}
          </CardContent></Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tasks</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><div className="flex gap-2"><Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add task" className="h-8" /><Button size="sm" className="h-8" onClick={() => void postJson(`/api/cases/${caseId}/tasks`, { title: newTask })}>Add</Button></div>{tasks.map((t) => <div key={t.id} className="flex items-center gap-2 rounded border border-border px-2 py-1"><Checkbox checked={t.isDone} onCheckedChange={async (checked) => { await fetch(`/api/cases/${caseId}/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDone: Boolean(checked) }) }); await loadCase() }} /><span className={t.isDone ? "line-through text-muted-foreground" : ""}>{t.title}</span></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Investigation note" className="min-h-[80px]" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/notes`, { body: newNote })}>Add note</Button>{notes.map((n) => <div key={n.id} className="rounded border border-border px-2 py-1"><div>{n.body}</div><div className="text-muted-foreground">{formatDate(n.createdAt)}</div></div>)}</CardContent></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Hypotheses</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Input value={newHypothesis} onChange={(e) => setNewHypothesis(e.target.value)} placeholder="Hypothesis" className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/hypotheses`, { statement: newHypothesis, confidence: 50, status: "open" })}>Add</Button>{hypotheses.map((h) => <div key={h.id} className="rounded border border-border px-2 py-1"><div>{h.statement}</div><div className="mt-1 flex gap-1"><Badge variant="outline">{h.status}</Badge><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/hypotheses/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }) }); await loadCase() }}>Confirm</Button><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/hypotheses/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }); await loadCase() }}>Reject</Button></div></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Response Actions</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Select value={newActionType} onValueChange={(v) => setNewActionType(v as ResponseAction["actionType"])}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contain_host">Contain host</SelectItem><SelectItem value="disable_user">Disable user</SelectItem><SelectItem value="block_ip">Block IP</SelectItem><SelectItem value="block_domain">Block domain</SelectItem><SelectItem value="block_hash">Block hash</SelectItem><SelectItem value="revoke_sessions">Revoke sessions</SelectItem><SelectItem value="isolate_resource">Isolate resource</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select><Input value={newActionTarget} onChange={(e) => setNewActionTarget(e.target.value)} placeholder="Target" className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/response-actions`, { actionType: newActionType, target: newActionTarget, status: "planned" })}>Add</Button>{responseActions.map((a) => <div key={a.id} className="rounded border border-border px-2 py-1"><div>{a.actionType} - {a.target}</div><div className="mt-1 flex gap-1"><Badge variant="outline">{a.status}</Badge><Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await fetch(`/api/cases/${caseId}/response-actions/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) }); await loadCase() }}>Complete</Button></div></div>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Input value={newTimelineTitle} onChange={(e) => setNewTimelineTitle(e.target.value)} placeholder="Timeline event title" className="h-8" /><Button size="sm" onClick={() => void postJson(`/api/cases/${caseId}/timeline`, { eventType: "custom", title: newTimelineTitle, eventAt: new Date().toISOString() })}>Add</Button>{timelineEvents.map((ev) => <div key={ev.id} className="rounded border border-border px-2 py-1"><div>{ev.title}</div><div className="text-muted-foreground">{ev.eventType} - {formatDate(ev.eventAt)}</div></div>)}</CardContent></Card>
          </div>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Activity</CardTitle></CardHeader><CardContent className="space-y-1">{activity.map((entry) => <div key={entry.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{entry.action.replace(/_/g, " ")}</span> - {formatDate(entry.createdAt)}</div>)}</CardContent></Card>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
