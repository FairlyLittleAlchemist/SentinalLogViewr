"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { Recommendation } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Zap,
} from "lucide-react"

const priorityStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
}

const effortLabels = {
  low: "Low Effort",
  medium: "Medium Effort",
  high: "High Effort",
}

const statusConfig = {
  pending: { icon: Clock, label: "Pending", color: "text-muted-foreground" },
  in_progress: { icon: Loader2, label: "In Progress", color: "text-[hsl(38,92%,50%)]" },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-[hsl(142,71%,45%)]" },
}

export default function RecommendationsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actions, setActions] = useState<Recommendation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRecommendations() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/recommendations", { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to load recommendations (${response.status})`)
        }
        const payload = (await response.json()) as { recommendations: Recommendation[] }
        setActions(payload.recommendations)
        setLoadError(null)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load recommendations")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadRecommendations()

    return () => controller.abort()
  }, [])

  const completedCount = actions.filter((a) => a.status === "completed").length
  const totalCount = actions.length
  const completionPercentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  const criticalPending = actions.filter(
    (a) => a.priority === "critical" && a.status === "pending"
  ).length

  return (
    <DashboardLayout>
      <AppHeader title="Recommendations" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4 lg:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Security Recommendations</h2>
            <p className="text-sm text-muted-foreground">
              Prioritized actions to strengthen your security posture based on current threat intelligence.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Completion Progress</span>
                    <span className="text-2xl font-bold text-foreground">{completionPercentage}%</span>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <Progress value={completionPercentage} className="mt-3 h-1.5 bg-secondary" />
                <span className="mt-1.5 text-[10px] text-muted-foreground">
                  {completedCount} of {totalCount} recommendations implemented
                </span>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Critical Pending</span>
                    <span className="text-2xl font-bold text-foreground">{criticalPending}</span>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                </div>
                <span className="mt-3 block text-[10px] text-muted-foreground">
                  Immediate action required for maximum risk reduction
                </span>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Quick Wins Available</span>
                    <span className="text-2xl font-bold text-foreground">
                      {actions.filter((a) => a.effort === "low" && a.status !== "completed").length}
                    </span>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(142,71%,45%)]/10">
                    <Zap className="h-4 w-4 text-[hsl(142,71%,45%)]" />
                  </div>
                </div>
                <span className="mt-3 block text-[10px] text-muted-foreground">
                  Low-effort actions with significant security impact
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Recommendation list */}
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
                  Loading recommendations...
                </CardContent>
              </Card>
            )}
            {actions.map((action) => {
              const isExpanded = expandedId === action.id
              const StatusIcon = statusConfig[action.status].icon

              return (
                <Card
                  key={action.id}
                  className={cn(
                    "bg-card border-border transition-colors",
                    action.status === "completed" && "opacity-70"
                  )}
                >
                  <CardContent className="p-0">
                    <button
                      type="button"
                      className="flex w-full items-start gap-4 p-4 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : action.id)}
                    >
                      <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", {
                        "bg-destructive/15": action.priority === "critical",
                        "bg-[hsl(38,92%,50%)]/15": action.priority === "high",
                        "bg-primary/15": action.priority === "medium",
                        "bg-[hsl(142,71%,45%)]/15": action.priority === "low",
                      })}>
                        <span className={cn("text-[10px] font-bold", {
                          "text-destructive": action.priority === "critical",
                          "text-[hsl(38,92%,50%)]": action.priority === "high",
                          "text-primary": action.priority === "medium",
                          "text-[hsl(142,71%,45%)]": action.priority === "low",
                        })}>
                          {action.priority === "critical" ? "!" : action.priority === "high" ? "H" : action.priority === "medium" ? "M" : "L"}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className={cn(
                            "text-sm font-medium",
                            action.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"
                          )}>
                            {action.title}
                          </h3>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn("text-[10px] px-1.5 py-0", priorityStyles[action.priority])}>
                            {action.priority}
                          </Badge>
                          <Badge className="bg-secondary text-[10px] px-1.5 py-0 text-foreground border-border">
                            {action.category}
                          </Badge>
                          <Badge className="bg-secondary text-[10px] px-1.5 py-0 text-foreground border-border">
                            {effortLabels[action.effort]}
                          </Badge>
                          <div className={cn("flex items-center gap-1 text-[10px]", statusConfig[action.status].color)}>
                            <StatusIcon className="h-3 w-3" />
                            <span>{statusConfig[action.status].label}</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-4 pt-3">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Description</span>
                            <p className="text-xs leading-relaxed text-foreground">{action.description}</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Expected Impact</span>
                            <p className="text-xs leading-relaxed text-[hsl(142,71%,45%)]">{action.impact}</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Related Alerts</span>
                            <div className="flex flex-wrap gap-1.5">
                              {action.relatedAlerts.map((alertId) => (
                                <Badge key={alertId} variant="outline" className="text-[10px] font-mono text-foreground border-border">
                                  {alertId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {action.status !== "completed" && (
                            <div className="flex items-center gap-2 pt-1">
                              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                                <span>Start Implementation</span>
                                <ArrowRight className="ml-1.5 h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-foreground border-border bg-transparent">
                                Create Ticket
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {!isLoading && actions.length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 text-xs text-muted-foreground">
                  No recommendations available.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
