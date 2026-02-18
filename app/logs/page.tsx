"use client"

import { Fragment, useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLocale, useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { LogEntry } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { Search, Filter, RefreshCw, Download } from "lucide-react"
import { formatEventFieldLabel, parseEventData, summarizeEventData } from "@/lib/event-data"

const severityStyles: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
  informational: "bg-muted text-muted-foreground border-border",
}

function formatTimestamp(timestamp: string, locale: string) {
  const date = new Date(timestamp)
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  })
}

function formatLogPreview(log: LogEntry, fallbackEmpty: string, fallbackPayload: string) {
  const preferred = log.summary?.trim() ?? ""
  if (preferred) return preferred
  const trimmed = log.message?.trim() ?? ""
  if (!trimmed) return fallbackEmpty
  return summarizeEventData(trimmed, { maxItems: 3, maxValueLength: 64 })
    ?? fallbackPayload
}

export default function LogsPage() {
  const t = useTranslations("pages")
  const tl = useTranslations("logs")
  const locale = useLocale()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [noisyFilter, setNoisyFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [totalLogs, setTotalLogs] = useState(0)
  const [sourceCounts, setSourceCounts] = useState<Array<{ source: string; count: number }>>([])
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadLogs() {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/logs?page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(tl("errors.loadWithStatus", { status: response.status }))
        }
        const payload = (await response.json()) as { logs: LogEntry[]; total: number }
        setLogs(payload.logs)
        setTotalLogs(payload.total ?? payload.logs.length)
        setLoadError(null)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : tl("errors.load"))
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadLogs()

    return () => controller.abort()
  }, [page, tl])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSourceCounts() {
      try {
        const response = await fetch("/api/logs/sources?limit=25", { signal: controller.signal })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as { sources: Array<{ source: string; count: number }> }
        setSourceCounts(payload.sources ?? [])
      } catch {
        if (!controller.signal.aborted) {
          setSourceCounts([])
        }
      }
    }

    loadSourceCounts()

    return () => controller.abort()
  }, [])

  const sources = sourceCounts.length
    ? sourceCounts.map((item) => item.source)
    : Array.from(new Set(logs.map((l) => l.source)))

  const topSources = (limit: number) => {
    if (sourceCounts.length) {
      return new Set(sourceCounts.slice(0, limit).map((item) => item.source))
    }
    const counts = new Map<string, number>()
    logs.forEach((log) => {
      counts.set(log.source, (counts.get(log.source) ?? 0) + 1)
    })
    return new Set(
      Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([source]) => source)
    )
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.id.toLowerCase().includes(search.toLowerCase()) ||
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.ipAddress.toLowerCase().includes(search.toLowerCase())
    const matchesSeverity = severityFilter === "all" || log.severity === severityFilter
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter
    const matchesNoisy =
      noisyFilter === "all" ||
      (noisyFilter === "top5" && topSources(5).has(log.source)) ||
      (noisyFilter === "top10" && topSources(10).has(log.source)) ||
      (noisyFilter === "top20" && topSources(20).has(log.source))
    return matchesSearch && matchesSeverity && matchesSource && matchesNoisy
  })

  const totalPages = Math.max(Math.ceil(totalLogs / pageSize), 1)

  return (
    <DashboardLayout>
      <AppHeader title={t("logs")} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4 lg:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">{t("logs")}</h2>
            <p className="text-sm text-muted-foreground">
              {tl("subtitle")}
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tl("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 bg-secondary pl-8 text-sm text-foreground font-mono placeholder:text-muted-foreground placeholder:font-sans"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-9 w-32 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder={tl("filters.severity")} />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">{tl("filters.allSeverity")}</SelectItem>
                  <SelectItem value="critical">{tl("severity.critical")}</SelectItem>
                  <SelectItem value="high">{tl("severity.high")}</SelectItem>
                  <SelectItem value="medium">{tl("severity.medium")}</SelectItem>
                  <SelectItem value="low">{tl("severity.low")}</SelectItem>
                  <SelectItem value="informational">{tl("severity.informational")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-40 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder={tl("filters.source")} />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">{tl("filters.allSources")}</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={noisyFilter} onValueChange={setNoisyFilter}>
                <SelectTrigger className="h-9 w-36 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder={tl("filters.noisiest")} />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">{tl("filters.allSources")}</SelectItem>
                  <SelectItem value="top5">{tl("filters.topSources", { count: 5 })}</SelectItem>
                  <SelectItem value="top10">{tl("filters.topSources", { count: 10 })}</SelectItem>
                  <SelectItem value="top20">{tl("filters.topSources", { count: 20 })}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground border-border bg-transparent">
                <RefreshCw className="h-4 w-4" />
                <span className="sr-only">{tl("actions.refresh")}</span>
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground border-border bg-transparent">
                <Download className="h-4 w-4" />
                <span className="sr-only">{tl("actions.export")}</span>
              </Button>
            </div>
          </div>

          {/* Log count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {tl("showingEntries", { shown: filteredLogs.length, total: totalLogs })}
            </span>
            <span className="text-xs text-muted-foreground">
              {tl("pageOf", { page, total: totalPages })}
            </span>
          </div>

          {/* Log Table */}
          <Card className="bg-card border-border overflow-hidden">
            <CardContent className="p-0">
              {loadError && (
                <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                  {loadError}
                </div>
              )}
                  {isLoading && (
                <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                  {tl("loading")}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[160px] text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.timestamp")}
                    </TableHead>
                    <TableHead className="w-[90px] text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.severity")}
                    </TableHead>
                    <TableHead className="w-[160px] text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.source")}
                    </TableHead>
                    <TableHead className="text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.message")}
                    </TableHead>
                    <TableHead className="w-[140px] text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.ipAddress")}
                    </TableHead>
                    <TableHead className="w-[180px] text-muted-foreground text-[11px] uppercase tracking-wide">
                      {tl("columns.user")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const isExpanded = expandedLog === log.id
                    const rawPayload = log.payloadRaw?.trim() || log.message
                    const parsedEntries = log.parsedFieldsPreview?.length
                      ? log.parsedFieldsPreview
                      : (() => {
                        const parsed = parseEventData(rawPayload)
                        return parsed
                          ? Object.entries(parsed).slice(0, 16).map(([key, value]) => ({
                            key,
                            label: formatEventFieldLabel(key),
                            value,
                          }))
                          : []
                      })()
                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          key={log.id}
                          className={cn(
                            "border-border cursor-pointer transition-colors",
                            isExpanded ? "bg-secondary/50" : "hover:bg-secondary/30"
                          )}
                          onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        >
                          <TableCell className="py-3 pr-2 font-mono text-[11px] text-muted-foreground">
                            {formatTimestamp(log.timestamp, locale)}
                          </TableCell>
                          <TableCell className="py-3 pr-2">
                            <Badge className={cn("text-[10px] px-1.5 py-0", severityStyles[log.severity])}>
                              {tl(`severity.${log.severity}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 pr-4 text-xs text-foreground leading-relaxed break-words">
                            {log.source}
                          </TableCell>
                          <TableCell className="py-3 pr-4 text-xs text-foreground leading-relaxed break-words line-clamp-2">
                            {formatLogPreview(log, tl("noMessage"), tl("payloadAttached"))}
                          </TableCell>
                          <TableCell className="py-3 pr-2 font-mono text-[11px] text-muted-foreground">
                            {log.ipAddress}
                          </TableCell>
                          <TableCell className="py-3 text-xs text-muted-foreground break-words">
                            {log.user}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="border-border bg-secondary/20">
                            <TableCell colSpan={6} className="px-4 py-4">
                              <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">{tl("detail.actor")}</div>
                                    <div className="text-xs text-foreground break-words">{log.actor || log.user || tl("unknown")}</div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">{tl("columns.ipAddress")}</div>
                                    <div className="text-xs text-foreground break-words">{log.ipAddress || tl("unknown")}</div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">{tl("detail.resource")}</div>
                                    <div className="text-xs text-foreground break-words">{log.resource || tl("unknown")}</div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">{tl("detail.status")}</div>
                                    <div className="text-xs text-foreground break-words">{log.status}</div>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">{tl("detail.eventData")}</div>
                                {parsedEntries.length > 0 && (
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                                    {parsedEntries.map((field) => (
                                      <div key={field.key} className="rounded-lg border border-border bg-card px-3 py-2">
                                        <div className="text-[10px] uppercase text-muted-foreground">{field.label}</div>
                                        <div className="text-xs text-foreground break-words">{field.value}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <details className="rounded-lg border border-border bg-card px-3 py-2">
                                  <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                    {tl("detail.rawPayload")}
                                  </summary>
                                  <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                                    {rawPayload}
                                  </div>
                                </details>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              {!isLoading && filteredLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12">
                  <p className="text-sm text-muted-foreground">{tl("emptyFiltered")}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="border-border"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page <= 1}
            >
              {tl("pagination.previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {tl("pagination.perPage", { count: pageSize })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-border"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={page >= totalPages}
            >
              {tl("pagination.next")}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
