"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AttackSource } from "@/lib/mock-data"
import { Progress } from "@/components/ui/progress"

interface AttackSourcesProps {
  sources: AttackSource[]
}

function formatSourceLabel(raw: string) {
  const value = raw?.trim() ?? ""
  if (!value || value === "-" || value.toLowerCase() === "unknown") {
    return { label: "Unknown", detail: "" }
  }

  const hasPath = value.includes("\\") || value.includes("/") || value.includes(":\\")
  if (hasPath) {
    const parts = value.split(/[/\\]/).filter(Boolean)
    const leaf = parts[parts.length - 1] ?? value
    return { label: leaf, detail: value }
  }

  return { label: value, detail: "" }
}

function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

export function AttackSources({ sources }: AttackSourcesProps) {
  if (!sources.length) {
    return (
      <Card className="interactive-surface hover-lift border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Top Attack Origins</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            No attack source data available.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="interactive-surface hover-lift border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">Top Attack Origins</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-4">
          {sources.map((source, index) => {
            const { label, detail } = formatSourceLabel(source.country)
            return (
              <div
                key={`${source.country}-${source.count}`}
                className="stagger-item rounded-md px-2 py-1 transition-colors hover:bg-secondary/35"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs font-semibold text-foreground truncate" title={detail || label}>
                      {label}
                    </span>
                    {detail && (
                      <span className="text-[10px] text-muted-foreground truncate" title={detail}>
                        {detail}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {formatCount(source.count)} ({source.percentage}%)
                  </span>
                </div>
                <Progress value={source.percentage} className="h-1.5 bg-secondary/70" />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
