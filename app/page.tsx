"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { MetricCards } from "@/components/dashboard/metric-cards"
import { AlertsChart } from "@/components/dashboard/alerts-chart"
import { SeverityChart } from "@/components/dashboard/severity-chart"
import { RecentAlerts } from "@/components/dashboard/recent-alerts"
import { AttackSources } from "@/components/dashboard/attack-sources"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  Alert,
  AttackSource,
  SeverityDistributionEntry,
  ThreatMetric,
  TimeSeriesPoint,
} from "@/lib/mock-data"

type DashboardPayload = {
  threatMetrics: ThreatMetric[]
  alertTimeSeries: TimeSeriesPoint[]
  severityDistribution: SeverityDistributionEntry[]
  topAttackSources: AttackSource[]
  recentAlerts: Alert[]
}

const initialDashboardData: DashboardPayload = {
  threatMetrics: [],
  alertTimeSeries: [],
  severityDistribution: [],
  topAttackSources: [],
  recentAlerts: [],
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardPayload>(initialDashboardData)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard", {
          signal: controller.signal,
          credentials: "include",
        })
        if (!response.ok) {
          throw new Error(`Failed to load dashboard data (${response.status})`)
        }
        const payload = (await response.json()) as DashboardPayload
        setDashboardData(payload)
        setLoadError(null)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load dashboard data")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadDashboard()

    return () => controller.abort()
  }, [])

  return (
    <DashboardLayout>
      <AppHeader title="Security Overview" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4 lg:p-6">
          <div className="animate-pop-in flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Threat Intelligence Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Real-time security monitoring and threat detection for your Azure environment.
            </p>
          </div>
          {loadError && (
            <div className="animate-slide-up rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
              {loadError}
            </div>
          )}
          {isLoading ? (
            <div className="animate-slide-up rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
              Loading dashboard stats...
            </div>
          ) : (
            <MetricCards metrics={dashboardData.threatMetrics} />
          )}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="stagger-item xl:col-span-2" style={{ animationDelay: "90ms" }}>
              <AlertsChart series={dashboardData.alertTimeSeries} />
            </div>
            <div className="stagger-item" style={{ animationDelay: "140ms" }}>
              <SeverityChart distribution={dashboardData.severityDistribution} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="stagger-item xl:col-span-2" style={{ animationDelay: "180ms" }}>
              <RecentAlerts alerts={dashboardData.recentAlerts} />
            </div>
            <div className="stagger-item" style={{ animationDelay: "230ms" }}>
              <AttackSources sources={dashboardData.topAttackSources} />
            </div>
          </div>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
