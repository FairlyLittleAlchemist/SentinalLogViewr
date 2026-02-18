import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

function avg(numbers: number[]) {
  if (!numbers.length) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function minutesBetween(a: string | null, b: string | null) {
  if (!a || !b) return null
  const start = new Date(a).getTime()
  const end = new Date(b).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.round((end - start) / 60000)
}

export async function GET() {
  const supabase = await createClient()
  const { user } = await getCurrentUserAndRole(supabase)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: cases }, { data: activities }] = await Promise.all([
    supabase
      .from("alert_cases")
      .select("id,created_at,updated_at,resolved_at,closed_at,status,disposition,sla_status,assignee,due_at")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("alert_case_activity")
      .select("id,case_id,action,created_at")
      .in("action", ["case_reopened"])
      .gte("created_at", thirtyDaysAgo),
  ])

  const mttrValues = (cases ?? [])
    .map((entry) => minutesBetween(entry.created_at, entry.resolved_at || entry.closed_at))
    .filter((value): value is number => value !== null)

  const mttaValues = (cases ?? [])
    .map((entry) => {
      if (entry.status === "open") return null
      return minutesBetween(entry.created_at, entry.updated_at)
    })
    .filter((value): value is number => value !== null)

  const totalCases = (cases ?? []).length || 1
  const falsePositiveCount = (cases ?? []).filter((entry) => entry.disposition === "false_positive" || entry.disposition === "duplicate").length
  const reopenedCaseIds = new Set((activities ?? []).map((entry) => entry.case_id))

  const workloadMap = new Map<string, number>()
  for (const entry of cases ?? []) {
    if (entry.status !== "open" && entry.status !== "in_progress") continue
    const key = String(entry.assignee || "Unassigned")
    workloadMap.set(key, (workloadMap.get(key) ?? 0) + 1)
  }

  const breachTrendBuckets = new Map<string, { date: string; total: number; breached: number }>()
  for (const entry of cases ?? []) {
    if (!entry.due_at || entry.created_at < fourteenDaysAgo) continue
    const date = new Date(entry.due_at).toISOString().slice(0, 10)
    const bucket = breachTrendBuckets.get(date) ?? { date, total: 0, breached: 0 }
    bucket.total += 1
    if (entry.sla_status === "breached") {
      bucket.breached += 1
    }
    breachTrendBuckets.set(date, bucket)
  }

  return NextResponse.json({
    mttaMinutes: avg(mttaValues),
    mttrMinutes: avg(mttrValues),
    reopenRate: reopenedCaseIds.size / totalCases,
    falsePositiveRate: falsePositiveCount / totalCases,
    workload: Array.from(workloadMap.entries())
      .map(([assignee, activeCases]) => ({ assignee, activeCases }))
      .sort((a, b) => b.activeCases - a.activeCases),
    slaBreachTrend: Array.from(breachTrendBuckets.values()).sort((a, b) => a.date.localeCompare(b.date)),
  })
}
