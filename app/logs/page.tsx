"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { ScrollArea } from "@/components/ui/scroll-area"
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

const severityStyles: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
  informational: "bg-muted text-muted-foreground border-border",
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  })
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadLogs() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/logs", { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to load logs (${response.status})`)
        }
        const payload = (await response.json()) as { logs: LogEntry[] }
        setLogs(payload.logs)
        setLoadError(null)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load logs")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadLogs()

    return () => controller.abort()
  }, [])

  const sources = Array.from(new Set(logs.map((l) => l.source)))

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.id.toLowerCase().includes(search.toLowerCase()) ||
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.ipAddress.toLowerCase().includes(search.toLowerCase())
    const matchesSeverity = severityFilter === "all" || log.severity === severityFilter
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter
    return matchesSearch && matchesSeverity && matchesSource
  })

  return (
    <DashboardLayout>
      <AppHeader title="Log Viewer" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4 lg:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Log Viewer</h2>
            <p className="text-sm text-muted-foreground">
              Browse and analyze security logs from Azure Sentinel data connectors.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs by message, user, IP address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 bg-secondary pl-8 text-sm text-foreground font-mono placeholder:text-muted-foreground placeholder:font-sans"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-9 w-32 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="informational">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-40 bg-secondary text-sm text-foreground">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground">
                  <SelectItem value="all">All Sources</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground border-border bg-transparent">
                <RefreshCw className="h-4 w-4" />
                <span className="sr-only">Refresh logs</span>
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground border-border bg-transparent">
                <Download className="h-4 w-4" />
                <span className="sr-only">Export logs</span>
              </Button>
            </div>
          </div>

          {/* Log count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {filteredLogs.length} of {logs.length} log entries
            </span>
            <span className="text-xs text-muted-foreground">
              Auto-refresh: 30s
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
                  Loading logs...
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[140px] text-muted-foreground text-xs">Timestamp</TableHead>
                    <TableHead className="w-[80px] text-muted-foreground text-xs">Severity</TableHead>
                    <TableHead className="w-[120px] text-muted-foreground text-xs">Source</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Message</TableHead>
                    <TableHead className="w-[120px] text-muted-foreground text-xs">IP Address</TableHead>
                    <TableHead className="w-[160px] text-muted-foreground text-xs">User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow
                      key={log.id}
                      className={cn(
                        "border-border cursor-pointer transition-colors",
                        expandedLog === log.id ? "bg-secondary/50" : "hover:bg-secondary/30"
                      )}
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <TableCell className="py-2.5 font-mono text-[11px] text-muted-foreground">
                        {formatTimestamp(log.timestamp)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge className={cn("text-[10px] px-1.5 py-0", severityStyles[log.severity])}>
                          {log.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-foreground">{log.source}</TableCell>
                      <TableCell className="py-2.5 text-xs text-foreground max-w-xs truncate font-mono">
                        {log.message}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-[11px] text-muted-foreground">
                        {log.ipAddress}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground truncate max-w-[160px]">
                        {log.user}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!isLoading && filteredLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12">
                  <p className="text-sm text-muted-foreground">No logs match your filters.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </DashboardLayout>
  )
}
