"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AttackSource } from "@/lib/mock-data"
import { Progress } from "@/components/ui/progress"

interface AttackSourcesProps {
  sources: AttackSource[]
}

export function AttackSources({ sources }: AttackSourcesProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">Top Attack Origins</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-4">
          {sources.map((source) => (
            <div key={source.country} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{source.country}</span>
                <span className="text-xs text-muted-foreground">
                  {source.count} ({source.percentage}%)
                </span>
              </div>
              <Progress
                value={source.percentage}
                className="h-1.5 bg-secondary"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
