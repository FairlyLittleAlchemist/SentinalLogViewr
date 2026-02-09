import {
  alertTimeSeries,
  mockAlerts,
  mockLogs,
  recommendedActions,
  severityDistribution,
  threatMetrics,
  topAttackSources,
  type Alert,
  type AttackSource,
  type LogEntry,
  type Recommendation,
  type SeverityDistributionEntry,
  type ThreatMetric,
  type TimeSeriesPoint,
} from "@/lib/mock-data"

export interface DashboardData {
  threatMetrics: ThreatMetric[]
  alertTimeSeries: TimeSeriesPoint[]
  severityDistribution: SeverityDistributionEntry[]
  topAttackSources: AttackSource[]
  recentAlerts: Alert[]
}

let alerts: Alert[] = [...mockAlerts]
let logs: LogEntry[] = [...mockLogs]
let recommendations: Recommendation[] = [...recommendedActions]

export function getAlerts(): Alert[] {
  return alerts
}

export function getAlertById(id: string): Alert | undefined {
  return alerts.find((alert) => alert.id === id)
}

export function updateAlert(
  id: string,
  updates: Partial<Pick<Alert, "status" | "assignee">>
): Alert | undefined {
  const index = alerts.findIndex((alert) => alert.id === id)
  if (index === -1) {
    return undefined
  }
  alerts[index] = { ...alerts[index], ...updates }
  return alerts[index]
}

export function getLogs(): LogEntry[] {
  return logs
}

export function getRecommendations(): Recommendation[] {
  return recommendations
}

export function updateRecommendation(
  id: string,
  updates: Partial<Pick<Recommendation, "status">>
): Recommendation | undefined {
  const index = recommendations.findIndex((rec) => rec.id === id)
  if (index === -1) {
    return undefined
  }
  recommendations[index] = { ...recommendations[index], ...updates }
  return recommendations[index]
}

export function getDashboardData(): DashboardData {
  return {
    threatMetrics,
    alertTimeSeries,
    severityDistribution,
    topAttackSources,
    recentAlerts: alerts.slice(0, 5),
  }
}
