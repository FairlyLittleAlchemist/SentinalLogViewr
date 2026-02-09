"use client"

import { useEffect, useState } from "react"
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
import type { Alert } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  Search,
  Filter,
  ChevronRight,
  User,
  Clock,
  Target,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react"

const severityStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadAlerts() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/alerts", { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to load alerts (${response.status})`)
        }
        const payload = (await response.json()) as { alerts: Alert[] }
        setAlerts(payload.alerts)
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
  }, [])

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(search.toLowerCase()) ||
      alert.description.toLowerCase().includes(search.toLowerCase()) ||
      alert.id.toLowerCase().includes(search.toLowerCase())
    const matchesSeverity = severityFilter === "all" || alert.severity === severityFilter
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter
    return matchesSearch && matchesSeverity && matchesStatus
  })

  return (
    <DashboardLayout>
      <AppHeader title="Alert Management" />
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

          {/* Alert Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const count = alerts.filter((a) => a.severity === sev).length
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
                      "bg-primary": sev === "medium",
                      "bg-[hsl(142,71%,45%)]": sev === "low",
                    })} />
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Alert List */}
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
            {filteredAlerts.map((alert) => {
              const StatusIcon = statusIcons[alert.status]
              return (
                <Card
                  key={alert.id}
                  className="bg-card border-border cursor-pointer transition-colors hover:bg-secondary/30"
                  onClick={() => setSelectedAlert(alert)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", {
                        "bg-destructive": alert.severity === "critical",
                        "bg-[hsl(38,92%,50%)]": alert.severity === "high",
                        "bg-primary": alert.severity === "medium",
                        "bg-[hsl(142,71%,45%)]": alert.severity === "low",
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
                            <h3 className="text-sm font-medium text-foreground">{alert.title}</h3>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{alert.description}</p>
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
            {!isLoading && filteredAlerts.length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="flex flex-col items-center justify-center p-12">
                  <Shield className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">No alerts match your filters.</p>
                </CardContent>
              </Card>
            )}
          </div>
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
                </div>
                <DialogTitle className="text-foreground">{selectedAlert.title}</DialogTitle>
                <DialogDescription className="text-muted-foreground">{selectedAlert.description}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-4">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Source</span>
                    <span className="text-xs font-medium text-foreground">{selectedAlert.source}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Status</span>
                    <span className="text-xs font-medium text-foreground">{statusLabels[selectedAlert.status]}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Assignee</span>
                    <span className="text-xs font-medium text-foreground">{selectedAlert.assignee || "Unassigned"}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 p-3">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Time</span>
                    <span className="text-xs font-medium text-foreground">{formatTimestamp(selectedAlert.timestamp)}</span>
                  </div>
                </div>

                {/* MITRE Tactics */}
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

                {/* Affected Entities */}
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

                {/* Recommended Actions */}
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

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Investigate
                  </Button>
                  <Button size="sm" variant="outline" className="text-foreground border-border bg-transparent">
                    Assign
                  </Button>
                  <Button size="sm" variant="outline" className="text-foreground border-border bg-transparent">
                    Dismiss
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
