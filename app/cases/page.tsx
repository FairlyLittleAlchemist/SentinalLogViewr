"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLocale, useTranslations } from "next-intl"
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

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

export default function CasesPage() {
  const t = useTranslations("pages")
  const tc = useTranslations("cases")
  const locale = useLocale()
  const [cases, setCases] = useState<CaseItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/cases", { signal: controller.signal })
        if (!response.ok) throw new Error(tc("errors.loadCasesWithStatus", { status: response.status }))
        const payload = await response.json() as { cases: CaseItem[] }
        setCases(payload.cases ?? [])
        setError(null)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : tc("errors.loadCases"))
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
      <AppHeader title={t("cases")} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{tc("title")}</h2>
              <p className="text-sm text-muted-foreground">{tc("subtitle")}</p>
            </div>
            <Badge variant="outline" className="text-xs">{tc("totalCount", { count: cases.length })}</Badge>
          </div>

          {isLoading ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">{tc("loading")}</CardContent></Card>
          ) : null}
          {error ? (
            <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
          ) : null}

          {!isLoading && !error && cases.length === 0 ? (
            <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                {tc.rich("empty", {
                  alertsLink: (chunks) => <Link className="text-primary underline" href="/alerts">{chunks}</Link>,
                })}
              </CardContent>
            </Card>
          ) : null}

          {!isLoading && !error && cases.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{tc(`status.${item.status}`)}</Badge>
                <Badge>{item.priority}</Badge>
                <Badge variant="secondary">{tc("alertId", { id: item.alertId })}</Badge>
                <span className="text-muted-foreground">{tc("assignee", { value: item.assignee || tc("unassigned") })}</span>
                <span className="text-muted-foreground">{tc("updated", { value: formatDate(item.updatedAt, locale) })}</span>
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link href={`/cases/${item.id}`}>{tc("openCase")}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
