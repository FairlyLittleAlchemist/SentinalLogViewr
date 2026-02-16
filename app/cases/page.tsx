"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type CaseItem = {
  id: string
  alertId: string
  title: string
  status: "open" | "in_progress" | "resolved" | "closed"
  priority: "low" | "medium" | "high" | "critical"
  assignee: string | null
  createdAt: string
  updatedAt: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/cases", { signal: controller.signal })
        if (!response.ok) throw new Error(`Failed to load cases (${response.status})`)
        const payload = await response.json() as { cases: CaseItem[] }
        setCases(payload.cases ?? [])
        setError(null)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load cases")
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  return (
    <DashboardLayout>
      <AppHeader title="Case Management" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Cases</h2>
              <p className="text-sm text-muted-foreground">Track investigation progress, notes, tasks, and evidence.</p>
            </div>
            <Badge variant="outline" className="text-xs">{cases.length} total</Badge>
          </div>

          {isLoading ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading cases...</CardContent></Card>
          ) : null}
          {error ? (
            <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
          ) : null}

          {!isLoading && !error && cases.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No cases yet. Create one from an alert in <Link className="text-primary underline" href="/alerts">Alert Management</Link>.
              </CardContent>
            </Card>
          ) : null}

          {!isLoading && !error && cases.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{item.status.replace("_", " ")}</Badge>
                <Badge>{item.priority}</Badge>
                <Badge variant="secondary">Alert {item.alertId}</Badge>
                <span className="text-muted-foreground">Assignee: {item.assignee || "Unassigned"}</span>
                <span className="text-muted-foreground">Updated: {formatDate(item.updatedAt)}</span>
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link href={`/cases/${item.id}`}>Open Case</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
