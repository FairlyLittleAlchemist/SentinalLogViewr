"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Alert } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

const severityStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
}

const statusStyles = {
  new: "bg-primary/15 text-primary",
  in_progress: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]",
  resolved: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)]",
  dismissed: "bg-muted text-muted-foreground",
}

interface RecentAlertsProps {
  alerts: Alert[]
}

export function RecentAlerts({ alerts }: RecentAlertsProps) {
  const t = useTranslations("dashboard")
  const locale = useLocale()
  const recentAlerts = alerts.slice(0, 5)

  return (
    <Card className="interactive-surface hover-lift border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">{t("recentAlerts")}</CardTitle>
          <Link href="/alerts" className="text-xs font-medium text-primary transition-all hover:underline hover:opacity-80">
            {t("viewAll")}
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-3">
          {recentAlerts.length === 0 && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
              {t("noRecentAlerts")}
            </div>
          )}
          {recentAlerts.map((alert, index) => (
            <div
              key={alert.id}
              className="stagger-item hover-glow flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3"
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", {
                "bg-destructive": alert.severity === "critical",
                "bg-[hsl(38,92%,50%)]": alert.severity === "high",
                "bg-primary": alert.severity === "medium",
                "bg-[hsl(142,71%,45%)]": alert.severity === "low",
              })} />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium leading-tight text-foreground">{alert.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px] px-1.5 py-0", severityStyles[alert.severity])}>
                    {alert.severity}
                  </Badge>
                  <Badge className={cn("text-[10px] px-1.5 py-0", statusStyles[alert.status])}>
                    {alert.status.replace("_", " ")}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{alert.source}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
