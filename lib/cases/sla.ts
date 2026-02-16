type CasePriority = "low" | "medium" | "high" | "critical"
type CaseStatus = "open" | "in_progress" | "resolved" | "closed"

const SLA_HOURS_BY_PRIORITY: Record<CasePriority, number> = {
  critical: 4,
  high: 12,
  medium: 24,
  low: 72,
}

export function computeDueAt(priority: CasePriority, createdAt = new Date()) {
  const due = new Date(createdAt)
  due.setHours(due.getHours() + SLA_HOURS_BY_PRIORITY[priority])
  return due.toISOString()
}

export function computeSlaStatus(dueAt: string | null | undefined, now = new Date()) {
  if (!dueAt) return "on_track" as const
  const dueTime = new Date(dueAt).getTime()
  const nowTime = now.getTime()
  const remainingMs = dueTime - nowTime

  if (remainingMs <= 0) return "breached" as const

  const thresholdMs = 3 * 60 * 60 * 1000
  if (remainingMs <= thresholdMs) return "at_risk" as const
  return "on_track" as const
}

export function computeEscalationTarget(
  status: CaseStatus,
  dueAt: string | null | undefined,
  now = new Date()
) {
  if (status === "resolved" || status === "closed" || !dueAt) {
    return { level: 0, target: null as "analyst" | "admin" | null }
  }

  const overdueMs = now.getTime() - new Date(dueAt).getTime()
  if (overdueMs <= 0) return { level: 0, target: null as "analyst" | "admin" | null }
  if (overdueMs >= 24 * 60 * 60 * 1000) return { level: 2, target: "admin" as const }
  return { level: 1, target: "analyst" as const }
}
