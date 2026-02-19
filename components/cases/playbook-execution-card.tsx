"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type StepStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked"
type Stage = "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident"

type PlaybookTemplateOption = {
  id: string
  name: string
}

type PlaybookExecutionState = {
  execution: {
    template: {
      name: string
      current_version: number
    }
    strictMode: boolean
    progress: {
      done: number
      total: number
    }
  } | null
  steps: Array<{
    id: string
    order: number
    title: string
    stage: Stage
    required: boolean
    statusId: string | null
    status: StepStatus
  }>
  stageProgress: Record<Stage, { done: number; total: number }>
}

type Props = {
  title: string
  selectPlaceholder: string
  bindLabel: string
  reseedLabel: string
  strictLabel: string
  standardLabel: string
  requiredLabel: string
  optionalLabel: string
  noneBoundLabel: string
  selectedPlaybookId: string
  availablePlaybooks: PlaybookTemplateOption[]
  state: PlaybookExecutionState | null
  stageLabel: (stage: Stage) => string
  statusLabel: (status: StepStatus) => string
  onSelectPlaybook: (value: string) => void
  onBind: () => void
  onReseed: () => void
  onSetStepStatus: (statusId: string, status: StepStatus) => void
}

function stepStatusTone(status: StepStatus) {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
  if (status === "in_progress") return "bg-blue-500/10 text-blue-700 border-blue-500/30"
  if (status === "blocked") return "bg-red-500/10 text-red-700 border-red-500/30"
  if (status === "skipped") return "bg-amber-500/10 text-amber-700 border-amber-500/30"
  return "bg-muted text-muted-foreground border-border"
}

export function PlaybookExecutionCard({
  title,
  selectPlaceholder,
  bindLabel,
  reseedLabel,
  strictLabel,
  standardLabel,
  requiredLabel,
  optionalLabel,
  noneBoundLabel,
  selectedPlaybookId,
  availablePlaybooks,
  state,
  stageLabel,
  statusLabel,
  onSelectPlaybook,
  onBind,
  onReseed,
  onSetStepStatus,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/20 p-3">
          <Select value={selectedPlaybookId} onValueChange={onSelectPlaybook}>
            <SelectTrigger className="h-9 w-full min-w-[260px] md:w-[320px]">
              <SelectValue placeholder={selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {availablePlaybooks.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={onBind}>
            {bindLabel}
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={onReseed}>
            {reseedLabel}
          </Button>
        </div>

        {state?.execution ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-medium">
                {state.execution.template.name}
              </Badge>
              <Badge variant="outline" className="font-mono">
                v{state.execution.template.current_version}
              </Badge>
              <Badge variant={state.execution.strictMode ? "default" : "outline"}>
                {state.execution.strictMode ? strictLabel : standardLabel}
              </Badge>
              <Badge variant="secondary" className="font-medium">
                {state.execution.progress.done}/{state.execution.progress.total}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(state.stageProgress).map(([stage, info]) => (
                <Badge key={stage} variant={info.total > 0 && info.done === info.total ? "default" : "outline"} className="text-xs">
                  {stageLabel(stage as Stage)} {info.done}/{info.total}
                </Badge>
              ))}
            </div>

            <div className="space-y-2">
              {state.steps.map((step) => (
                <div key={step.id} className="flex flex-col gap-2 rounded-md border border-border bg-muted/15 px-3 py-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {step.order}. {step.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{stageLabel(step.stage)}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {step.required ? requiredLabel : optionalLabel}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${stepStatusTone(step.status)}`}>
                        {statusLabel(step.status)}
                      </Badge>
                    </div>
                  </div>
                  <Select
                    value={step.status}
                    onValueChange={(value) => {
                      if (!step.statusId) return
                      onSetStepStatus(step.statusId, value as StepStatus)
                    }}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{statusLabel("pending")}</SelectItem>
                      <SelectItem value="in_progress">{statusLabel("in_progress")}</SelectItem>
                      <SelectItem value="completed">{statusLabel("completed")}</SelectItem>
                      <SelectItem value="skipped">{statusLabel("skipped")}</SelectItem>
                      <SelectItem value="blocked">{statusLabel("blocked")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">{noneBoundLabel}</div>
        )}
      </CardContent>
    </Card>
  )
}
