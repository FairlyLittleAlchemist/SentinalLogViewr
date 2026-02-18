"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { Alert } from "@/lib/mock-data"
import { formatEventFieldLabel, parseEventData, summarizeEventData } from "@/lib/event-data"
import { cn } from "@/lib/utils"
import {
  Search,
  Filter,
  ChevronRight,
  Copy,
  Check,
  User,
  Clock,
  Target,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Share2,
  Link2,
  GitBranch,
  ClipboardList,
  Plus,
} from "lucide-react"
import { Light as SyntaxHighlighter } from "react-syntax-highlighter"
import { vs2015 } from "react-syntax-highlighter/dist/esm/styles/hljs"
import xmlFormat from "xml-formatter"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslations } from "next-intl"

const severityStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-[hsl(45,93%,47%)]/15 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30",
  low: "bg-[hsl(210,90%,56%)]/15 text-[hsl(210,90%,56%)] border-[hsl(210,90%,56%)]/30",
}

const statusIcons = {
  new: AlertTriangle,
  in_progress: Loader2,
  resolved: CheckCircle2,
  dismissed: XCircle,
}

const statusLabels = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
}

type AlertType = "incident" | "activity" | "firewall" | "security_event"

type SavedView = {
  id: string
  name: string
  filters: {
    search: string
    severity: string
    status: string
    type: AlertType
  }
  isShared: boolean
  shareToken: string | null
}

type CorrelationTimelineItem = {
  id: string
  title: string
  severity: string
  status: string
  timestamp: string
  source: string
  actor: string | null
  ipAddress: string | null
  resource: string | null
}

type CorrelationPayload = {
  totalRelated: number
  timeline: CorrelationTimelineItem[]
  grouped: {
    byActor: Array<{ key: string; alerts: CorrelationTimelineItem[] }>
    byIp: Array<{ key: string; alerts: CorrelationTimelineItem[] }>
    byResource: Array<{ key: string; alerts: CorrelationTimelineItem[] }>
  }
}

type CaseItem = {
  id: string
  alertId: string
  title: string
  status: "open" | "in_progress" | "resolved" | "closed"
  priority: "low" | "medium" | "high" | "critical"
  alertType?: string | null
  alertSeverity?: string | null
  playbookKey?: string | null
  assignee: string | null
  assigneeUserId?: string | null
  dueAt?: string | null
  slaStatus?: "on_track" | "at_risk" | "breached"
  escalationLevel?: number
  escalationTarget?: "analyst" | "admin" | null
  escalatedAt?: string | null
  createdAt: string
  updatedAt: string
}

type CaseNote = { id: string; body: string; createdAt: string; createdBy: string }
type CaseTask = { id: string; title: string; isDone: boolean; dueAt: string | null }
type CaseEvidence = { id: string; label: string; evidenceType: string; url: string | null; details: string | null }
type CaseActivity = { id: string; action: string; createdAt: string; details: Record<string, unknown> }
type CaseAssigneeHint = { id: string; name: string; email: string; role: string; openCases: number }
type PlaybookOption = { id: string; name: string; key: string; isActive: boolean }

const TYPE_TABS: Array<{ type: AlertType; label: string }> = [
  { type: "incident", label: "Incidents" },
  { type: "security_event", label: "Security Events" },
  { type: "activity", label: "Activity" },
  { type: "firewall", label: "Firewall" },
]

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

function formatAlertPreview(alert: Alert) {
  const preferred = alert.summary?.trim() ?? ""
  if (preferred) return preferred
  const trimmed = alert.description?.trim() ?? ""
  if (!trimmed) return "No description provided."
  return summarizeEventData(trimmed, { maxItems: 3, maxValueLength: 64 })
    ?? "Event payload attached. Open to view details."
}

function formatAlertTitle(title: string) {
  const trimmed = title?.trim() ?? ""
  if (!trimmed) return "Event"
  if (trimmed.includes("/") && trimmed === trimmed.toUpperCase()) {
    const tokens = trimmed.split("/").filter(Boolean)
    const last = tokens[tokens.length - 2] ?? tokens[tokens.length - 1] ?? trimmed
    return last
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .toLowerCase()
      .replace(/^./, (ch) => ch.toUpperCase())
  }
  return trimmed
}

type RawLanguage = "json" | "xml" | "kv" | "text"

function detectRawLanguage(value: string): RawLanguage {
  const trimmed = value.trim()
  if (!trimmed) return "text"
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return "json"
  }
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return "xml"
  }
  if (trimmed.includes("=") && trimmed.includes(";")) {
    return "kv"
  }
  return "text"
}

function prettyRaw(value: string, language: RawLanguage) {
  if (!value.trim()) return value
  if (language === "json") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  if (language === "xml") {
    try {
      return xmlFormat(value, { indentation: "  " })
    } catch {
      return value
    }
  }
  if (language === "kv") {
    return value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n")
  }
  return value
}

function languageForHighlighter(language: RawLanguage) {
  if (language === "kv") return "ini"
  return language
}

function getRawRowValue(row: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!row) return ""
  const entries = Object.entries(row)
  for (const key of keys) {
    const needle = key.toLowerCase()
    for (const [rowKey, rowValue] of entries) {
      if (String(rowKey).toLowerCase() === needle) {
        const text = String(rowValue ?? "").trim()
        if (text && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined") return text
      }
    }
  }
  return ""
}

type AlertsListProps = {
  alerts: Alert[]
  isLoading: boolean
  loadError: string | null
  onSelect: (alert: Alert) => void
  page: number
  totalAlerts: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}

function AlertsListBase(props: AlertsListProps & { emptyLabel: string }) {
  const {
    alerts,
    isLoading,
    loadError,
    onSelect,
    page,
    totalAlerts,
    totalPages,
    onPrev,
    onNext,
    emptyLabel,
  } = props

  return (
    <>
      <div className="flex flex-col gap-3">
        {loadError && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-xs text-muted-foreground">
              {loadError}
            </CardContent>
          </Card>
        )}
        {isLoading && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-xs text-muted-foreground">
              Loading alerts...
            </CardContent>
          </Card>
        )}
        {alerts.map((alert) => {
          const StatusIcon = statusIcons[alert.status]
          return (
            <Card
              key={alert.id}
              className="bg-card border-border cursor-pointer transition-colors hover:bg-secondary/30"
              onClick={() => onSelect(alert)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", {
                    "bg-destructive": alert.severity === "critical",
                    "bg-[hsl(38,92%,50%)]": alert.severity === "high",
                    "bg-[hsl(45,93%,47%)]": alert.severity === "medium",
                    "bg-[hsl(210,90%,56%)]": alert.severity === "low",
                  })} />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{alert.id}</span>
                          <Badge className={cn("text-[10px] px-1.5 py-0", severityStyles[alert.severity])}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <h3 className="text-sm font-medium text-foreground">{formatAlertTitle(alert.title)}</h3>
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {formatAlertPreview(alert)}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />
                        <span>{statusLabels[alert.status]}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimestamp(alert.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        <span>{alert.source}</span>
                      </div>
                      {alert.eventCode && (
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{alert.eventCode}</span>
                        </div>
                      )}
                      {alert.assignee && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{alert.assignee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {!isLoading && alerts.length === 0 && (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center p-12">
              <Shield className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {alerts.length} of {totalAlerts} alerts
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            onClick={onPrev}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            onClick={onNext}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  )
}

function IncidentAlertsList(props: AlertsListProps) {
  return <AlertsListBase {...props} emptyLabel="No incidents match your filters." />
}

function SecurityEventAlertsList(props: AlertsListProps) {
  return <AlertsListBase {...props} emptyLabel="No security events match your filters." />
}

function ActivityAlertsList(props: AlertsListProps) {
  return <AlertsListBase {...props} emptyLabel="No activity alerts match your filters." />
}

function FirewallAlertsList(props: AlertsListProps) {
  return <AlertsListBase {...props} emptyLabel="No firewall alerts match your filters." />
}

export default function AlertsPage() {
  const t = useTranslations("pages")
  const searchParams = useSearchParams()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<AlertType>("incident")
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [eventSearch, setEventSearch] = useState("")
  const [actionPending, setActionPending] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [severityTotals, setSeverityTotals] = useState<Record<"critical" | "high" | "medium" | "low", number>>({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  })
  const [typeTotals, setTypeTotals] = useState<Record<AlertType, number>>({
    incident: 0,
    activity: 0,
    firewall: 0,
    security_event: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [selectedViewId, setSelectedViewId] = useState<string>("")
  const [viewNameInput, setViewNameInput] = useState("")
  const [savingView, setSavingView] = useState(false)
  const [copiedViewToken, setCopiedViewToken] = useState<string | null>(null)
  const [correlation, setCorrelation] = useState<CorrelationPayload | null>(null)
  const [correlationLoading, setCorrelationLoading] = useState(false)
  const [caseItem, setCaseItem] = useState<CaseItem | null>(null)
  const [caseNotes, setCaseNotes] = useState<CaseNote[]>([])
  const [caseTasks, setCaseTasks] = useState<CaseTask[]>([])
  const [caseEvidence, setCaseEvidence] = useState<CaseEvidence[]>([])
  const [caseActivity, setCaseActivity] = useState<CaseActivity[]>([])
  const [caseAssignees, setCaseAssignees] = useState<CaseAssigneeHint[]>([])
  const [selectedAssigneeUserId, setSelectedAssigneeUserId] = useState<string>("")
  const [availablePlaybooks, setAvailablePlaybooks] = useState<PlaybookOption[]>([])
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>("")
  const [caseLoading, setCaseLoading] = useState(false)
  const [caseNoteInput, setCaseNoteInput] = useState("")
  const [caseTaskInput, setCaseTaskInput] = useState("")
  const [caseEvidenceLabel, setCaseEvidenceLabel] = useState("")
  const [caseEvidenceUrl, setCaseEvidenceUrl] = useState("")
  const rawPayloadSource = (
    selectedAlert?.rawPayloadFull ??
    selectedAlert?.payloadRaw ??
    (selectedAlert?.payloadJson ? JSON.stringify(selectedAlert.payloadJson) : "") ??
    selectedAlert?.description ??
    ""
  ).trim()
  const rawRowSource = selectedAlert?.rawRow ? JSON.stringify(selectedAlert.rawRow) : ""
  const rawPayloadLanguage = detectRawLanguage(rawPayloadSource)
  const rawRowLanguage: RawLanguage = "json"
  const prettyPayload = prettyRaw(rawPayloadSource, rawPayloadLanguage)
  const prettyRow = rawRowSource ? prettyRaw(rawRowSource, rawRowLanguage) : ""
  const hasStructuredPayload =
    rawPayloadLanguage === "json" || rawPayloadLanguage === "xml" || rawPayloadLanguage === "kv"
  const headerDescription = (() => {
    const summary = selectedAlert?.summary?.trim() || selectedAlert?.parsedFacts?.summary?.trim() || ""
    if (summary) return summary
    const description = selectedAlert?.description?.trim() || ""
    if (description && !hasStructuredPayload) {
      return description.length > 160 ? `${description.slice(0, 160)}...` : description
    }
    return "Open Event Data to inspect the full payload."
  })()
  const parsedEntries = selectedAlert?.parsedFieldsPreview?.length
    ? selectedAlert.parsedFieldsPreview
    : (() => {
      const parsedEventData = selectedAlert ? parseEventData(rawPayloadSource || selectedAlert.description || "") : null
      return parsedEventData
        ? Object.entries(parsedEventData).slice(0, 16).map(([key, value]) => ({
          key,
          label: formatEventFieldLabel(key),
          value,
        }))
        : []
    })()
  const filteredParsedEntries = parsedEntries.filter((field) => {
    if (!eventSearch.trim()) return true
    const needle = eventSearch.toLowerCase()
    return (
      field.label.toLowerCase().includes(needle) ||
      field.value.toLowerCase().includes(needle) ||
      field.key.toLowerCase().includes(needle)
    )
  })

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1200)
    } catch {
      // ignore clipboard failures
    }
  }

  const currentFilters = useMemo(() => ({
    search,
    severity: severityFilter,
    status: statusFilter,
    type: typeFilter,
  }), [search, severityFilter, statusFilter, typeFilter])

  async function loadSavedViews(token?: string) {
    const query = token ? `?token=${encodeURIComponent(token)}` : ""
    const response = await fetch(`/api/saved-views${query}`)
    if (!response.ok) throw new Error(`Failed to load saved views (${response.status})`)
    const payload = await response.json() as { views: SavedView[] }
    setSavedViews(payload.views ?? [])
    return payload.views ?? []
  }

  function applySavedView(filters: SavedView["filters"]) {
    setSearch(filters.search ?? "")
    setSeverityFilter(filters.severity ?? "all")
    setStatusFilter(filters.status ?? "all")
    setTypeFilter(filters.type ?? "incident")
    setPage(1)
  }

  async function createSavedView() {
    const name = viewNameInput.trim() || `View ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
    setSavingView(true)
    try {
      const response = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          filters: currentFilters,
          isShared: true,
        }),
      })
      if (!response.ok) throw new Error(`Failed to create saved view (${response.status})`)
      const payload = await response.json() as { view: SavedView }
      setSavedViews((existing) => [payload.view, ...existing])
      setSelectedViewId(payload.view.id)
      setViewNameInput("")
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to create saved view")
    } finally {
      setSavingView(false)
    }
  }

  async function copySavedViewLink(view: SavedView) {
    if (!view.shareToken) return
    const link = `${window.location.origin}/alerts?view=${view.shareToken}`
    await navigator.clipboard.writeText(link)
    setCopiedViewToken(view.shareToken)
    setTimeout(() => setCopiedViewToken((current) => (current === view.shareToken ? null : current)), 1500)
  }

  async function loadCorrelation(alertId: string) {
    setCorrelationLoading(true)
    try {
      const response = await fetch(`/api/alerts/${alertId}/correlation`)
      if (!response.ok) throw new Error(`Failed to load correlation (${response.status})`)
      const payload = await response.json() as { correlation: CorrelationPayload }
      setCorrelation(payload.correlation)
    } catch (error) {
      setCorrelation(null)
      setLoadError(error instanceof Error ? error.message : "Failed to load correlation")
    } finally {
      setCorrelationLoading(false)
    }
  }

  async function loadCaseForAlert(alertId: string) {
    setCaseLoading(true)
    try {
      const response = await fetch(`/api/cases?alertId=${encodeURIComponent(alertId)}`)
      if (!response.ok) throw new Error(`Failed to load cases (${response.status})`)
      const payload = await response.json() as { cases: CaseItem[] }
      const current = payload.cases?.[0] ?? null
      setCaseItem(current)
      if (!current) {
        setCaseNotes([])
        setCaseTasks([])
        setCaseEvidence([])
        setCaseActivity([])
        return
      }
      const detailResponse = await fetch(`/api/cases/${current.id}`)
      if (!detailResponse.ok) throw new Error(`Failed to load case details (${detailResponse.status})`)
      const detailPayload = await detailResponse.json() as {
        case: CaseItem
        notes: CaseNote[]
        tasks: CaseTask[]
        evidence: CaseEvidence[]
        activity: CaseActivity[]
      }
      setCaseItem(detailPayload.case)
      setSelectedAssigneeUserId(detailPayload.case.assigneeUserId ?? "")
      setCaseNotes(detailPayload.notes ?? [])
      setCaseTasks(detailPayload.tasks ?? [])
      setCaseEvidence(detailPayload.evidence ?? [])
      setCaseActivity(detailPayload.activity ?? [])
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load case data")
    } finally {
      setCaseLoading(false)
    }
  }

  async function loadCaseAssignees() {
    const response = await fetch("/api/cases/assignees")
    if (!response.ok) throw new Error(`Failed to load assignees (${response.status})`)
    const payload = await response.json() as { assignees: CaseAssigneeHint[] }
    setCaseAssignees(payload.assignees ?? [])
  }

  async function loadPlaybookOptions(alertType: AlertType | "") {
    const query = alertType ? `?alertType=${encodeURIComponent(alertType)}&isActive=true` : "?isActive=true"
    const response = await fetch(`/api/playbooks${query}`)
    if (!response.ok) throw new Error(`Failed to load playbooks (${response.status})`)
    const payload = await response.json() as {
      playbooks: Array<{ id: string; name: string; key: string; isActive: boolean }>
    }
    const options = (payload.playbooks ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      key: entry.key,
      isActive: entry.isActive,
    }))
    setAvailablePlaybooks(options)
    setSelectedPlaybookId((current) => {
      if (current && options.some((entry) => entry.id === current)) return current
      return options[0]?.id ?? ""
    })
  }

  async function createCaseForSelectedAlert() {
    if (!selectedAlert) return
    if (availablePlaybooks.length > 0 && !selectedPlaybookId) {
      setLoadError("Select a playbook before creating a case.")
      return
    }
    setCaseLoading(true)
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: selectedAlert.id,
          priority: "medium",
          assignee: selectedAlert.assignee,
          assigneeUserId: selectedAssigneeUserId || null,
          playbookId: selectedPlaybookId || null,
        }),
      })
      if (!response.ok) throw new Error(`Failed to create case (${response.status})`)
      const payload = await response.json() as { case: CaseItem }
      setCaseItem(payload.case)
      await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to create case")
    } finally {
      setCaseLoading(false)
    }
  }

  async function addCaseNote() {
    if (!caseItem || !caseNoteInput.trim()) return
    try {
      const response = await fetch(`/api/cases/${caseItem.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: caseNoteInput }),
      })
      if (!response.ok) throw new Error(`Failed to add note (${response.status})`)
      setCaseNoteInput("")
      if (selectedAlert) await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to add note")
    }
  }

  async function addCaseTask() {
    if (!caseItem || !caseTaskInput.trim()) return
    try {
      const response = await fetch(`/api/cases/${caseItem.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: caseTaskInput }),
      })
      if (!response.ok) throw new Error(`Failed to add task (${response.status})`)
      setCaseTaskInput("")
      if (selectedAlert) await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to add task")
    }
  }

  async function toggleTask(task: CaseTask, checked: boolean) {
    if (!caseItem) return
    try {
      const response = await fetch(`/api/cases/${caseItem.id}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone: checked }),
      })
      if (!response.ok) throw new Error(`Failed to update task (${response.status})`)
      if (selectedAlert) await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update task")
    }
  }

  async function addCaseEvidence() {
    if (!caseItem || !caseEvidenceLabel.trim()) return
    try {
      const response = await fetch(`/api/cases/${caseItem.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: caseEvidenceLabel,
          evidenceType: caseEvidenceUrl.trim() ? "link" : "note",
          url: caseEvidenceUrl.trim() || null,
          details: null,
        }),
      })
      if (!response.ok) throw new Error(`Failed to add evidence (${response.status})`)
      setCaseEvidenceLabel("")
      setCaseEvidenceUrl("")
      if (selectedAlert) await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to add evidence")
    }
  }

  async function updateCaseAssignee() {
    if (!caseItem) return
    try {
      const response = await fetch(`/api/cases/${caseItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeUserId: selectedAssigneeUserId || null,
        }),
      })
      if (!response.ok) throw new Error(`Failed to update assignee (${response.status})`)
      if (selectedAlert) await loadCaseForAlert(selectedAlert.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update assignee")
    }
  }

  async function updateSelectedAlert(updates: Partial<Pick<Alert, "status" | "assignee">>) {
    if (!selectedAlert) return
    setActionPending(true)
    try {
      const response = await fetch(`/api/alerts/${selectedAlert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        throw new Error(`Failed to update alert (${response.status})`)
      }
      const payload = (await response.json()) as { alert: Alert }
      const updated = { ...selectedAlert, ...payload.alert }
      setSelectedAlert(updated)
      setAlerts((current) => current.map((item) => (item.id === updated.id ? { ...item, ...payload.alert } : item)))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update alert")
    } finally {
      setActionPending(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadAlerts() {
      try {
        setIsLoading(true)
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          search,
          severity: severityFilter,
          status: statusFilter,
          type: typeFilter,
        })
        const response = await fetch(`/api/alerts?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to load alerts (${response.status})`)
        }
        const payload = (await response.json()) as {
          alerts: Alert[]
          total: number
          severityTotals?: Record<"critical" | "high" | "medium" | "low", number>
          typeTotals?: Record<AlertType, number>
        }
        setAlerts(payload.alerts)
        setTotalAlerts(payload.total ?? payload.alerts.length)
        setSeverityTotals(payload.severityTotals ?? { critical: 0, high: 0, medium: 0, low: 0 })
        setTypeTotals(payload.typeTotals ?? { incident: 0, activity: 0, firewall: 0, security_event: 0 })
        setLoadError(null)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load alerts")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadAlerts()

    return () => controller.abort()
  }, [page, search, severityFilter, statusFilter, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [search, severityFilter, statusFilter, typeFilter])

  useEffect(() => {
    setAlerts([])
    setTotalAlerts(0)
    setSelectedAlert(null)
  }, [typeFilter])

  useEffect(() => {
    setEventSearch("")
    setCopiedKey(null)
  }, [selectedAlert?.id])

  useEffect(() => {
    const token = searchParams.get("view") ?? undefined
    void loadSavedViews(token)
      .then((views) => {
        if (!token) return
        const matched = views.find((entry) => entry.shareToken === token)
        if (matched) {
          setSelectedViewId(matched.id)
          applySavedView(matched.filters)
        }
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load saved views")
      })
  }, [searchParams])

  useEffect(() => {
    void loadCaseAssignees().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Failed to load assignees")
    })
  }, [])

  useEffect(() => {
    if (!selectedAlert?.id) {
      setCorrelation(null)
      setCaseItem(null)
      setCaseNotes([])
      setCaseTasks([])
      setCaseEvidence([])
      setCaseActivity([])
      setAvailablePlaybooks([])
      setSelectedPlaybookId("")
      return
    }
    void loadPlaybookOptions((selectedAlert.type || selectedAlert.parsedFacts?.kind || "") as AlertType | "")
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load playbooks")
      })
    void loadCorrelation(selectedAlert.id)
    void loadCaseForAlert(selectedAlert.id)
  }, [selectedAlert?.id])

  const totalPages = Math.max(Math.ceil(totalAlerts / pageSize), 1)
  const selectedType = (selectedAlert?.type || selectedAlert?.parsedFacts?.kind || "") as AlertType | ""
  const selectedTypeLabel = selectedType
    ? (TYPE_TABS.find((entry) => entry.type === selectedType)?.label ?? selectedType)
    : "Unknown"

  return (
    <DashboardLayout>
      <AppHeader title={t("alerts")} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4 lg:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Alert Management</h2>
            <p className="text-sm text-muted-foreground">
              Investigate, triage, and respond to security alerts from Azure Sentinel.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search alerts by title, description, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 bg-secondary pl-8 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-9 w-32 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3 sm:flex-row sm:items-center">
            <Select
              value={selectedViewId || "none"}
              onValueChange={(value) => {
                if (value === "none") {
                  setSelectedViewId("")
                  return
                }
                setSelectedViewId(value)
                const selected = savedViews.find((view) => view.id === value)
                if (selected) applySavedView(selected.filters)
              }}
            >
              <SelectTrigger className="h-8 w-full bg-secondary sm:w-64">
                <SelectValue placeholder="Saved views" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Saved views</SelectItem>
                {savedViews.map((view) => (
                  <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={viewNameInput}
              onChange={(event) => setViewNameInput(event.target.value)}
              placeholder="Name this view..."
              className="h-8 sm:w-56"
            />
            <Button size="sm" variant="outline" onClick={() => void createSavedView()} disabled={savingView}>
              <Save className="mr-1 h-3.5 w-3.5" />
              Save current
            </Button>
            {selectedViewId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const selected = savedViews.find((view) => view.id === selectedViewId)
                  if (selected?.shareToken) void copySavedViewLink(selected)
                }}
              >
                <Share2 className="mr-1 h-3.5 w-3.5" />
                {copiedViewToken && savedViews.find((view) => view.id === selectedViewId)?.shareToken === copiedViewToken ? "Copied" : "Copy share link"}
              </Button>
            ) : null}
          </div>

          {/* Alert Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const count = severityTotals[sev] ?? 0
              return (
                <Card key={sev} className="bg-card border-border">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium uppercase text-muted-foreground">{sev}</span>
                      <span className="text-xl font-bold text-foreground">{count}</span>
                    </div>
                    <div className={cn("h-2 w-2 rounded-full", {
                      "bg-destructive": sev === "critical",
                      "bg-[hsl(38,92%,50%)]": sev === "high",
                      "bg-[hsl(45,93%,47%)]": sev === "medium",
                      "bg-[hsl(210,90%,56%)]": sev === "low",
                    })} />
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as AlertType)} className="mt-1">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/60 md:grid-cols-4">
              {TYPE_TABS.map((entry) => (
                <TabsTrigger key={entry.type} value={entry.type} className="text-xs">
                  {entry.label}{" "}
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {typeTotals[entry.type] ?? 0}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="incident" className="mt-4">
              <IncidentAlertsList
                alerts={alerts}
                isLoading={isLoading}
                loadError={loadError}
                onSelect={setSelectedAlert}
                page={page}
                totalAlerts={totalAlerts}
                totalPages={totalPages}
                onPrev={() => setPage((current) => Math.max(current - 1, 1))}
                onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
              />
            </TabsContent>
            <TabsContent value="security_event" className="mt-4">
              <SecurityEventAlertsList
                alerts={alerts}
                isLoading={isLoading}
                loadError={loadError}
                onSelect={setSelectedAlert}
                page={page}
                totalAlerts={totalAlerts}
                totalPages={totalPages}
                onPrev={() => setPage((current) => Math.max(current - 1, 1))}
                onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
              />
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <ActivityAlertsList
                alerts={alerts}
                isLoading={isLoading}
                loadError={loadError}
                onSelect={setSelectedAlert}
                page={page}
                totalAlerts={totalAlerts}
                totalPages={totalPages}
                onPrev={() => setPage((current) => Math.max(current - 1, 1))}
                onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
              />
            </TabsContent>
            <TabsContent value="firewall" className="mt-4">
              <FirewallAlertsList
                alerts={alerts}
                isLoading={isLoading}
                loadError={loadError}
                onSelect={setSelectedAlert}
                page={page}
                totalAlerts={totalAlerts}
                totalPages={totalPages}
                onPrev={() => setPage((current) => Math.max(current - 1, 1))}
                onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Alert Detail Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-foreground border-border sm:max-w-2xl">
          {selectedAlert && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{selectedAlert.id}</span>
                  <Badge className={cn("text-[10px] px-1.5 py-0", severityStyles[selectedAlert.severity])}>
                    {selectedAlert.severity}
                  </Badge>
                  {selectedType ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
                      {selectedTypeLabel}
                    </Badge>
                  ) : null}
                </div>
                <DialogTitle className="text-foreground">{formatAlertTitle(selectedAlert.title)}</DialogTitle>
                <DialogDescription className="text-muted-foreground">{headerDescription}</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="summary" className="mt-4">
                <TabsList className="grid w-full grid-cols-4 bg-secondary/60">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="correlation">Correlation</TabsTrigger>
                  <TabsTrigger value="case">Case</TabsTrigger>
                  <TabsTrigger value="event">Event Data</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="mt-4">
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Source</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.source}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Type</span>
                        <span className="text-xs font-medium text-foreground">{selectedTypeLabel}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Status</span>
                        <span className="text-xs font-medium text-foreground">{statusLabels[selectedAlert.status]}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Assignee</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.assignee || selectedAlert.parsedFacts?.owner || "Unassigned"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Time</span>
                        <span className="text-xs font-medium text-foreground">{formatTimestamp(selectedAlert.timestamp)}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Provider</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.parsedFacts?.provider || selectedAlert.provider || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Event Code</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.eventCode || selectedAlert.parsedFacts?.incidentId || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Status Source</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.statusSource || "detected"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Source File</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.sourceFile || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Payload Kind</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.payloadKind || "text"}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Investigation Context</h4>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Actor</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.actor || selectedAlert.parsedFacts?.actor || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">IP Address</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.ipAddress || selectedAlert.parsedFacts?.ip || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Resource</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.resource || selectedAlert.parsedFacts?.resource || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Classification</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.parsedFacts?.classification || "Unclassified"}</div>
                        </div>
                      </div>
                    </div>

                    {selectedType === "firewall" ? (
                      <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Network Context</h4>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Source IP</div>
                            <div className="text-xs text-foreground break-words">
                              {getRawRowValue(selectedAlert.rawRow, ["sourceip", "srcip", "src_ip", "source_ip"]) || selectedAlert.ipAddress || selectedAlert.parsedFacts?.ip || "Unknown"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Destination IP</div>
                            <div className="text-xs text-foreground break-words">
                              {getRawRowValue(selectedAlert.rawRow, ["destinationip", "destip", "dstip", "dst_ip", "destination_ip"]) || "Unknown"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Protocol</div>
                            <div className="text-xs text-foreground break-words">
                              {getRawRowValue(selectedAlert.rawRow, ["protocol", "networkprotocol", "proto"]) || "Unknown"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Destination Port</div>
                            <div className="text-xs text-foreground break-words">
                              {getRawRowValue(selectedAlert.rawRow, ["destinationport", "destport", "dstport", "dst_port", "destination_port"]) || "Unknown"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Risk Context</h4>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Category</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.category || selectedAlert.parsedFacts?.category || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Action</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.parsedFacts?.action || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Linked Alerts</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.parsedFacts?.alertCount || "Unknown"}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Incident ID</div>
                          <div className="text-xs text-foreground break-words">{selectedAlert.parsedFacts?.incidentId || "Unknown"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Evidence IDs</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set([selectedAlert.id, selectedAlert.eventCode, selectedAlert.parsedFacts?.incidentId]
                          .filter(Boolean)
                          .map((value) => String(value))))
                          .map((value) => (
                            <Badge key={value} variant="outline" className="font-mono text-[10px]">
                              {value}
                            </Badge>
                          ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">MITRE ATT&CK Tactics</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAlert.tactics.map((tactic) => (
                          <Badge key={tactic} variant="outline" className="text-[10px] text-foreground border-border">
                            {tactic}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Affected Entities</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAlert.affectedEntities.map((entity) => (
                          <Badge key={entity} className="bg-secondary text-[10px] text-foreground border-border">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Recommended Actions</h4>
                      <div className="flex flex-col gap-2">
                        {selectedAlert.recommendedActions.map((action, idx) => (
                          <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                              {idx + 1}
                            </div>
                            <span className="text-xs leading-relaxed text-foreground">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => void updateSelectedAlert({ status: "in_progress" })}
                        disabled={actionPending}
                      >
                        Mark In Progress
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground border-border bg-transparent"
                        onClick={() => void updateSelectedAlert({ status: "resolved" })}
                        disabled={actionPending}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground border-border bg-transparent"
                        onClick={() => void updateSelectedAlert({ status: "dismissed" })}
                        disabled={actionPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="correlation" className="mt-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Correlation Overview</h4>
                      <Badge variant="outline" className="text-[10px]">
                        {correlation?.totalRelated ?? 0} related
                      </Badge>
                    </div>
                    {correlationLoading ? (
                      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                        Loading correlation...
                      </div>
                    ) : null}
                    {!correlationLoading && correlation && correlation.timeline.length > 0 ? (
                      <div className="space-y-2">
                        {correlation.timeline.map((item) => (
                          <div key={`timeline-${item.id}`} className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-foreground">{formatAlertTitle(item.title)}</div>
                              <div className="text-[10px] text-muted-foreground">{formatTimestamp(item.timestamp)}</div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                              <Badge variant="outline" className="font-mono text-[10px]">{item.id}</Badge>
                              {item.actor ? <Badge variant="secondary" className="text-[10px]">Actor: {item.actor}</Badge> : null}
                              {item.ipAddress ? <Badge variant="secondary" className="text-[10px]">IP: {item.ipAddress}</Badge> : null}
                              {item.resource ? <Badge variant="secondary" className="text-[10px]">Resource: {item.resource}</Badge> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!correlationLoading && (!correlation || correlation.timeline.length === 0) ? (
                      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                        No related alerts found by actor, IP, resource, or incident ID.
                      </div>
                    ) : null}
                  </div>
                </TabsContent>
                <TabsContent value="case" className="mt-4">
                  <div className="flex flex-col gap-4">
                    {!caseItem ? (
                      <div className="rounded-lg border border-border bg-secondary/30 p-4">
                        <p className="text-xs text-muted-foreground">No case exists for this alert.</p>
                        <div className="mt-2 flex flex-col gap-2">
                          <Select value={selectedAssigneeUserId || "none"} onValueChange={setSelectedAssigneeUserId}>
                            <SelectTrigger className="h-8 bg-secondary md:w-80">
                              <SelectValue placeholder="Optional: assign on create" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {caseAssignees.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>
                                  {entry.name} ({entry.openCases} open)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={selectedPlaybookId} onValueChange={setSelectedPlaybookId}>
                            <SelectTrigger className="h-8 bg-secondary md:w-80">
                              <SelectValue placeholder="Select playbook" />
                            </SelectTrigger>
                            <SelectContent>
                              {availablePlaybooks.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>
                                  {entry.name} ({entry.key})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          className="mt-3"
                          onClick={() => void createCaseForSelectedAlert()}
                          disabled={caseLoading}
                        >
                          <ClipboardList className="mr-1 h-3.5 w-3.5" />
                          Create case
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Case ID</div>
                            <div className="text-xs font-mono text-foreground">{caseItem.id.slice(0, 8)}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Status</div>
                            <div className="text-xs text-foreground">{caseItem.status.replace("_", " ")}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Priority</div>
                            <div className="text-xs text-foreground">{caseItem.priority}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Assignee</div>
                            <div className="text-xs text-foreground">{caseItem.assignee || "Unassigned"}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Playbook</div>
                            <div className="text-xs text-foreground">{caseItem.playbookKey || "Standard"}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">SLA</div>
                            <div className="text-xs text-foreground">{caseItem.slaStatus || "on_track"}</div>
                            {caseItem.dueAt ? (
                              <div className="text-[10px] text-muted-foreground">Due {formatTimestamp(caseItem.dueAt)}</div>
                            ) : null}
                          </div>
                          <div className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="text-[10px] uppercase text-muted-foreground">Escalation</div>
                            <div className="text-xs text-foreground">
                              {caseItem.escalationLevel ? `L${caseItem.escalationLevel} ${caseItem.escalationTarget || ""}` : "None"}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Assignment Workflow</div>
                          <div className="flex flex-col gap-2 md:flex-row">
                            <Select value={selectedAssigneeUserId || "none"} onValueChange={setSelectedAssigneeUserId}>
                              <SelectTrigger className="h-8 bg-secondary md:w-72">
                                <SelectValue placeholder="Assign to analyst/admin" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {caseAssignees.map((entry) => (
                                  <SelectItem key={entry.id} value={entry.id}>
                                    {entry.name} ({entry.openCases} open)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="outline" onClick={() => void updateCaseAssignee()}>
                              Apply assignment
                            </Button>
                          </div>
                          <div className="mt-2 text-[10px] text-muted-foreground">
                            Workload hint uses active cases (`open` + `in_progress`) per assignee.
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Notes</h4>
                              <Badge variant="outline" className="text-[10px]">{caseNotes.length}</Badge>
                            </div>
                            <Textarea
                              value={caseNoteInput}
                              onChange={(event) => setCaseNoteInput(event.target.value)}
                              placeholder="Add investigation note..."
                              className="min-h-[70px] text-xs"
                            />
                            <Button size="sm" variant="outline" className="mt-2" onClick={() => void addCaseNote()}>
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Add note
                            </Button>
                            <div className="mt-3 space-y-2">
                              {caseNotes.slice(0, 5).map((note) => (
                                <div key={note.id} className="rounded border border-border px-2 py-1.5 text-xs text-foreground">
                                  <div className="text-[10px] text-muted-foreground">{formatTimestamp(note.createdAt)}</div>
                                  {note.body}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Tasks</h4>
                              <Badge variant="outline" className="text-[10px]">{caseTasks.length}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Input
                                value={caseTaskInput}
                                onChange={(event) => setCaseTaskInput(event.target.value)}
                                placeholder="Add task..."
                                className="h-8 text-xs"
                              />
                              <Button size="sm" variant="outline" onClick={() => void addCaseTask()}>Add</Button>
                            </div>
                            <div className="mt-3 space-y-2">
                              {caseTasks.map((task) => (
                                <div key={task.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
                                  <Checkbox checked={task.isDone} onCheckedChange={(checked) => void toggleTask(task, Boolean(checked))} />
                                  <span className={cn("text-foreground", task.isDone ? "line-through text-muted-foreground" : "")}>
                                    {task.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Evidence</h4>
                            <Badge variant="outline" className="text-[10px]">{caseEvidence.length}</Badge>
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <Input value={caseEvidenceLabel} onChange={(event) => setCaseEvidenceLabel(event.target.value)} placeholder="Evidence label" className="h-8 text-xs" />
                            <Input value={caseEvidenceUrl} onChange={(event) => setCaseEvidenceUrl(event.target.value)} placeholder="https://..." className="h-8 text-xs md:col-span-2" />
                          </div>
                          <Button size="sm" variant="outline" className="mt-2" onClick={() => void addCaseEvidence()}>
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Add evidence
                          </Button>
                          <div className="mt-3 space-y-2">
                            {caseEvidence.slice(0, 8).map((item) => (
                              <div key={item.id} className="rounded border border-border px-2 py-1.5 text-xs">
                                <div className="font-medium text-foreground">{item.label}</div>
                                {item.url ? <div className="text-muted-foreground">{item.url}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Audit Trail</h4>
                          </div>
                          <div className="space-y-1.5">
                            {caseActivity.slice(0, 10).map((entry) => (
                              <div key={entry.id} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{entry.action.replace(/_/g, " ")}</span> - {formatTimestamp(entry.createdAt)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="event" className="mt-4">
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Actor</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.actor || selectedAlert.assignee || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">IP Address</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.ipAddress || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Resource</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.resource || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">Category</span>
                        <span className="text-xs font-medium text-foreground">{selectedAlert.category || "Unknown"}</span>
                      </div>
                    </div>
                    {selectedAlert.parsedFacts?.ruleIds?.length ? (
                      <div className="rounded-lg border border-border bg-card px-3 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Related Rule IDs</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {selectedAlert.parsedFacts.ruleIds.map((ruleId) => (
                            <Badge key={ruleId} variant="outline" className="font-mono text-[10px]">
                              {ruleId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={eventSearch}
                        onChange={(event) => setEventSearch(event.target.value)}
                        placeholder="Search event fields..."
                        className="h-8 bg-secondary pl-8 text-xs"
                      />
                    </div>
                    {filteredParsedEntries.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {filteredParsedEntries.map((field) => (
                          <div key={field.key} className="rounded-lg border border-border bg-card px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] uppercase text-muted-foreground">{field.label}</div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-muted-foreground"
                                onClick={() => void copyValue(`field-${field.key}`, field.value)}
                              >
                                {copiedKey === `field-${field.key}` ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <div className="text-xs text-foreground break-words" title={field.value}>
                              {field.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                        No parsed event fields match this search.
                      </div>
                    )}

                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="raw">
                        <AccordionTrigger className="text-xs">Raw Payload</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-[10px] uppercase text-muted-foreground">Full Source Row (CSV)</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px]"
                                  onClick={() => void copyValue("raw-row", prettyRow || "No full source row available.")}
                                >
                                  {copiedKey === "raw-row" ? "Copied" : "Copy row"}
                                </Button>
                              </div>
                              {prettyRow ? (
                                <SyntaxHighlighter
                                  language={languageForHighlighter(rawRowLanguage)}
                                  style={vs2015}
                                  wrapLongLines
                                  customStyle={{
                                    margin: 0,
                                    borderRadius: "0.5rem",
                                    border: "1px solid hsl(var(--border))",
                                    background: "hsl(var(--secondary) / 0.2)",
                                    maxHeight: "14rem",
                                    fontSize: "11px",
                                  }}
                                >
                                  {prettyRow}
                                </SyntaxHighlighter>
                              ) : (
                                <div className="rounded-lg border border-border bg-secondary/20 p-3 text-[11px] text-muted-foreground">
                                  No full source row available.
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-[10px] uppercase text-muted-foreground">Extracted Payload Field</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px]"
                                  onClick={() => void copyValue("raw-payload", prettyPayload || "No event payload available.")}
                                >
                                  {copiedKey === "raw-payload" ? "Copied" : "Copy payload"}
                                </Button>
                              </div>
                              {prettyPayload ? (
                                <SyntaxHighlighter
                                  language={languageForHighlighter(rawPayloadLanguage)}
                                  style={vs2015}
                                  wrapLongLines
                                  customStyle={{
                                    margin: 0,
                                    borderRadius: "0.5rem",
                                    border: "1px solid hsl(var(--border))",
                                    background: "hsl(var(--secondary) / 0.2)",
                                    maxHeight: "16rem",
                                    fontSize: "11px",
                                  }}
                                >
                                  {prettyPayload}
                                </SyntaxHighlighter>
                              ) : (
                                <div className="rounded-lg border border-border bg-secondary/20 p-3 text-[11px] text-muted-foreground">
                                  No event payload available.
                                </div>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
