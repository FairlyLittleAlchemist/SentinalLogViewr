"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Clock, Shield } from "lucide-react"
import type { ThreatMetric } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const icons = [AlertTriangle, Shield, Activity, Clock]

interface MetricCardsProps {
  metrics: ThreatMetric[]
}

export function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => {
        const Icon = icons[index] ?? Activity
        const isNegativeChange = metric.changeType === "increase" && index !== 2
        return (
          <Card
            key={metric.label}
            className="interactive-surface hover-lift stagger-item border-border bg-card"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                  <span className="text-2xl font-bold text-foreground">
                    {index === 3 ? `${metric.value}m` : metric.value.toLocaleString()}
                  </span>
                </div>
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 ease-out hover:scale-110",
                  index === 0 && "bg-primary/10",
                  index === 1 && "bg-destructive/10",
                  index === 2 && "bg-[hsl(38,92%,50%)]/10",
                  index === 3 && "bg-[hsl(142,71%,45%)]/10",
                )}>
                  <Icon className={cn(
                    "h-4 w-4",
                    index === 0 && "text-primary",
                    index === 1 && "text-destructive",
                    index === 2 && "text-[hsl(38,92%,50%)]",
                    index === 3 && "text-[hsl(142,71%,45%)]",
                  )} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {isNegativeChange ? (
                  <TrendingUp className="h-3 w-3 text-destructive" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-[hsl(142,71%,45%)]" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  isNegativeChange ? "text-destructive" : "text-[hsl(142,71%,45%)]"
                )}>
                  {metric.change}%
                </span>
                <span className="text-xs text-muted-foreground">vs last 24h</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
