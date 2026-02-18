"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import dagre from "dagre"
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Bell, ChevronLeft, LayoutGrid, Link2, Save, ScrollText } from "lucide-react"
import { useTranslations } from "next-intl"

type AlertLibraryItem = {
  id: string
  title: string
  severity: string
  source: string
  timestamp: string
  status?: string
  type?: string | null
  description?: string
  category?: string | null
  provider?: string | null
  eventCode?: string | null
  eventName?: string | null
  actor?: string | null
  resource?: string | null
  ipAddress?: string | null
  summary?: string | null
}

type LogLibraryItem = {
  id: string
  message: string
  severity: string
  source: string
  timestamp: string
  status?: string
  category?: string | null
  provider?: string | null
  eventCode?: string | null
  eventName?: string | null
  actor?: string | null
  resource?: string | null
  ipAddress?: string | null
  summary?: string | null
}

type BoardStatePayload = {
  board: {
    id: string
    name: string
    boardType?: string | null
    caseId?: string | null
    viewport: { x: number; y: number; zoom: number }
  }
  nodes: Node[]
  edges: Edge[]
}

type PermissionPayload = { permissions?: string[] }

type ArtifactNodeData = {
  label: string
  subtitle?: string
  nodeType: "alert" | "log" | "note" | "entity" | "evidence"
  refId?: string
  severity?: string
  expanded?: boolean
  details?: Array<{ label: string; value: string }>
}

type BoardContextMenuState =
  | { kind: "node"; x: number; y: number; nodeId: string }
  | { kind: "edge"; x: number; y: number; edgeId: string; edgeType: string }
  | null

const EDGE_TYPE_OPTIONS = [
  { value: "related_to", label: "Related", color: "hsl(var(--primary))" },
  { value: "caused_by", label: "Caused By", color: "hsl(var(--destructive))" },
  { value: "observed_on", label: "Observed On", color: "hsl(var(--chart-2))" },
  { value: "same_actor", label: "Same Actor", color: "hsl(var(--muted-foreground))" },
  { value: "same_ip", label: "Same IP", color: "hsl(var(--accent-foreground))" },
  { value: "hypothesis", label: "Hypothesis", color: "hsl(var(--chart-4))" },
] as const

function ArtifactNode({ data }: { data: ArtifactNodeData }) {
  const details = Array.isArray(data.details) ? data.details : []

  return (
    <div className="min-w-[220px] max-w-[360px] rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur-[2px]">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-primary" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{data.label}</span>
        <Badge variant="outline" className="text-[10px] capitalize">{data.nodeType}</Badge>
      </div>
      {data.subtitle ? <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{data.subtitle}</div> : null}
      {data.expanded && details.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-border/70 pt-2">
          {details.map((item) => (
            <div key={`${item.label}:${item.value}`} className="text-[10px] leading-4">
              <span className="font-semibold text-foreground/90">{item.label}: </span>
              <span className="break-all text-muted-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">Double-click to {data.expanded ? "collapse" : "expand"}</div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-primary" />
    </div>
  )
}

const nodeTypes = { artifact: ArtifactNode }

function createNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function buildDetailRows(entry: Record<string, unknown>) {
  const candidates: Array<[string, unknown]> = [
    ["ID", entry.refId],
    ["Severity", entry.severity],
    ["Status", entry.status],
    ["Type", entry.type],
    ["Source", entry.source],
    ["Provider", entry.provider],
    ["Category", entry.category],
    ["Event Code", entry.eventCode],
    ["Event Name", entry.eventName],
    ["Actor", entry.actor],
    ["Resource", entry.resource],
    ["IP", entry.ipAddress],
    ["Summary", entry.summary],
    ["Description", entry.description],
    ["Message", entry.message],
  ]

  return candidates
    .map(([label, value]) => ({ label, value: String(value ?? "").trim() }))
    .filter((item) => item.value.length > 0)
    .slice(0, 14)
}

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 70 })

  nodes.forEach((node) => graph.setNode(node.id, { width: 220, height: 96 }))
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target))

  dagre.layout(graph)

  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id)
      return { ...node, position: { x: position.x - 110, y: position.y - 48 } }
    }),
    edges,
  }
}

function getEdgePreset(edgeType: string) {
  return EDGE_TYPE_OPTIONS.find((item) => item.value === edgeType) ?? EDGE_TYPE_OPTIONS[0]
}

function formatEdge(edge: Edge, edgeType: string): Edge {
  const preset = getEdgePreset(edgeType)
  return {
    ...edge,
    label: preset.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: preset.color },
    style: { ...edge.style, stroke: preset.color, strokeWidth: 1.8 },
    data: { ...(edge.data ?? {}), edgeType: preset.value },
  }
}

function buildTypedEdge(connection: Connection, edgeType: string): Edge {
  return formatEdge({ ...connection, id: createNodeId("edge"), type: "smoothstep", animated: true }, edgeType)
}

function BoardCanvasPageInner() {
  const t = useTranslations("pages")
  const tb = useTranslations("board")
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const boardId = String(params?.id ?? "")
  const forceSeed = searchParams.get("seed") === "1"

  const [boardName, setBoardName] = useState("")
  const [libraryTab, setLibraryTab] = useState<"alerts" | "logs">("alerts")
  const [librarySearch, setLibrarySearch] = useState("")
  const [alerts, setAlerts] = useState<AlertLibraryItem[]>([])
  const [logs, setLogs] = useState<LogLibraryItem[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [selectedEdgeType, setSelectedEdgeType] = useState<string>(EDGE_TYPE_OPTIONS[0].value)
  const [contextMenu, setContextMenu] = useState<BoardContextMenuState>(null)
  const [lastSavedAt, setLastSavedAt] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const boardPaneRef = useRef<HTMLDivElement | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)

  const canEditBoard = permissions.includes("boards.edit")

  const seedCaseBoard = useCallback(async (targetBoardId: string, caseId: string) => {
    const graphResponse = await fetch(`/api/cases/${caseId}/graph`)
    if (!graphResponse.ok) return
    const payload = await graphResponse.json() as { nodes: Node[]; edges: Edge[] }
    const seedNodes = payload.nodes ?? []
    const seedEdges = payload.edges ?? []
    if (seedNodes.length === 0) return

    setNodes(seedNodes)
    setEdges(seedEdges)

    if (reactFlowRef.current) {
      reactFlowRef.current.fitView({ duration: 260, padding: 0.18 })
    }
    const viewport = reactFlowRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 }

    await fetch(`/api/boards/${targetBoardId}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewport, nodes: seedNodes, edges: seedEdges }),
    })
  }, [setEdges, setNodes])

  const filteredAlerts = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    if (!needle) return alerts
    return alerts.filter((item) => item.id.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle) || item.source.toLowerCase().includes(needle))
  }, [alerts, librarySearch])

  const filteredLogs = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    if (!needle) return logs
    return logs.filter((item) => item.id.toLowerCase().includes(needle) || item.message.toLowerCase().includes(needle) || item.source.toLowerCase().includes(needle))
  }, [logs, librarySearch])

  const loadPage = useCallback(async () => {
    setIsLoading(true)
    try {
      const [boardRes, alertsRes, logsRes, permsRes] = await Promise.all([
        fetch(`/api/boards/${boardId}`, { cache: "no-store" }),
        fetch("/api/alerts?page=1&pageSize=80&type=all", { cache: "no-store" }),
        fetch("/api/logs?page=1&pageSize=80", { cache: "no-store" }),
        fetch("/api/me/permissions", { cache: "no-store" }),
      ])

      if (!boardRes.ok) throw new Error(`Failed to load board (${boardRes.status})`)

      const boardPayload = await boardRes.json() as BoardStatePayload
      setBoardName(boardPayload.board.name)
      const loadedNodes = boardPayload.nodes ?? []
      setNodes(loadedNodes)
      setEdges((boardPayload.edges ?? []).map((edge) => formatEdge(edge, String(edge.data?.edgeType ?? "related_to"))))
      pendingViewportRef.current = boardPayload.board.viewport

      if ((forceSeed || loadedNodes.length === 0) && boardPayload.board.caseId) {
        await seedCaseBoard(boardId, boardPayload.board.caseId)
      }

      if (alertsRes.ok) {
        const payload = await alertsRes.json() as { alerts?: AlertLibraryItem[] }
        setAlerts(payload.alerts ?? [])
      }

      if (logsRes.ok) {
        const payload = await logsRes.json() as { logs?: LogLibraryItem[] }
        setLogs(payload.logs ?? [])
      }

      if (permsRes.ok) {
        const payload = await permsRes.json() as PermissionPayload
        setPermissions(payload.permissions ?? [])
      }

      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load board")
    } finally {
      setIsLoading(false)
    }
  }, [boardId, forceSeed, seedCaseBoard, setEdges, setNodes])

  useEffect(() => {
    if (!boardId) return
    void loadPage()
  }, [boardId, loadPage])

  const persistBoardState = useCallback(async () => {
    if (!canEditBoard || !boardId || !reactFlowRef.current) return
    setIsSaving(true)
    try {
      const viewport = reactFlowRef.current.getViewport()
      const response = await fetch(`/api/boards/${boardId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewport, nodes, edges }),
      })
      if (!response.ok) throw new Error(`Failed to save board (${response.status})`)
      setLastSavedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save board")
    } finally {
      setIsSaving(false)
    }
  }, [boardId, canEditBoard, nodes, edges])

  useEffect(() => {
    if (!canEditBoard || isLoading) return
    const timer = setTimeout(() => {
      void persistBoardState()
    }, 900)
    return () => clearTimeout(timer)
  }, [canEditBoard, isLoading, nodes, edges, persistBoardState])

  const onConnect = useCallback((connection: Connection) => {
    if (!canEditBoard) return
    setEdges((current) => addEdge(buildTypedEdge(connection, selectedEdgeType), current))
  }, [canEditBoard, selectedEdgeType, setEdges])

  const onDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, payload: Record<string, unknown>) => {
    if (!canEditBoard) return
    event.dataTransfer.setData("application/x-board-node", JSON.stringify(payload))
    event.dataTransfer.effectAllowed = "copy"
  }, [canEditBoard])

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!canEditBoard || !reactFlowRef.current) return

    const raw = event.dataTransfer.getData("application/x-board-node")
    if (!raw) return

    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (!payload) return

    const position = reactFlowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })

    const nodeType = String(payload.nodeType ?? "entity") as ArtifactNodeData["nodeType"]
    const node: Node = {
      id: createNodeId(nodeType),
      type: "artifact",
      position,
      data: {
        label: String(payload.label ?? "Node"),
        subtitle: String(payload.subtitle ?? ""),
        nodeType,
        refId: String(payload.refId ?? ""),
        severity: String(payload.severity ?? ""),
        expanded: false,
        details: Array.isArray(payload.details)
          ? payload.details
            .map((item) => {
              if (!item || typeof item !== "object") return null
              const record = item as Record<string, unknown>
              return { label: String(record.label ?? "").trim(), value: String(record.value ?? "").trim() }
            })
            .filter((item): item is { label: string; value: string } => Boolean(item?.label && item?.value))
          : [],
      } as ArtifactNodeData,
    }

    setNodes((current) => [...current, node])
  }, [canEditBoard, setNodes])

  const applyAutoLayout = useCallback(() => {
    if (!canEditBoard) return
    const result = layoutGraph(nodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
  }, [canEditBoard, edges, nodes, setEdges, setNodes])

  const applyEdgeTypeToExisting = useCallback(() => {
    if (!canEditBoard) return
    setEdges((current) => current.map((edge) => formatEdge(edge, selectedEdgeType)))
  }, [canEditBoard, selectedEdgeType, setEdges])

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!canEditBoard) return
    setNodes((current) => current.map((entry) => {
      if (entry.id !== node.id) return entry
      const nodeData = (entry.data ?? {}) as ArtifactNodeData
      return { ...entry, data: { ...nodeData, expanded: !nodeData.expanded } }
    }))
  }, [canEditBoard, setNodes])

  const getMenuPosition = useCallback((event: React.MouseEvent) => {
    const paneBounds = boardPaneRef.current?.getBoundingClientRect()
    const rawX = event.clientX - (paneBounds?.left ?? 0)
    const rawY = event.clientY - (paneBounds?.top ?? 0)
    const maxX = Math.max(8, (paneBounds?.width ?? 0) - 220)
    const maxY = Math.max(8, (paneBounds?.height ?? 0) - 220)
    return { x: Math.min(Math.max(8, rawX), maxX), y: Math.min(Math.max(8, rawY), maxY) }
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    if (!canEditBoard) return
    event.preventDefault()
    const position = getMenuPosition(event)
    setContextMenu({ kind: "node", x: position.x, y: position.y, nodeId: node.id })
  }, [canEditBoard, getMenuPosition])

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (!canEditBoard) return
    event.preventDefault()
    const position = getMenuPosition(event)
    setContextMenu({ kind: "edge", x: position.x, y: position.y, edgeId: edge.id, edgeType: String(edge.data?.edgeType ?? EDGE_TYPE_OPTIONS[0].value) })
  }, [canEditBoard, getMenuPosition])

  const deleteNodeById = useCallback((nodeId: string) => {
    if (!canEditBoard) return
    setNodes((current) => current.filter((entry) => entry.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    setContextMenu(null)
  }, [canEditBoard, setEdges, setNodes])

  const deleteEdgeById = useCallback((edgeId: string) => {
    if (!canEditBoard) return
    setEdges((current) => current.filter((entry) => entry.id !== edgeId))
    setContextMenu(null)
  }, [canEditBoard, setEdges])

  const updateEdgeTypeById = useCallback((edgeId: string, edgeType: string) => {
    if (!canEditBoard) return
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? formatEdge(edge, edgeType) : edge)))
    setContextMenu(null)
  }, [canEditBoard, setEdges])

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }
    window.addEventListener("click", closeMenu)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("click", closeMenu)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  if (!boardId) {
    return <DashboardLayout><AppHeader title={t("board")} /><div className="p-6 text-sm text-muted-foreground">Board not found.</div></DashboardLayout>
  }

  return (
    <DashboardLayout>
      <AppHeader title={t("board")} />
      <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-border/80 bg-background lg:min-w-[340px] lg:max-w-[340px] lg:overflow-hidden">
          <Card className="flex min-h-0 flex-1 flex-col rounded-none border-x-0 border-b-0">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{tb("nodeLibrary")}</CardTitle>
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Link href="/board"><ChevronLeft className="mr-1 h-3.5 w-3.5" />Boards</Link>
                </Button>
              </div>
              <Input placeholder={tb("searchPlaceholder")} value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} className="h-8" />
              <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as "alerts" | "logs")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="alerts" className="text-xs"><Bell className="mr-1 h-3.5 w-3.5" />{tb("alertsTab")}</TabsTrigger>
                  <TabsTrigger value="logs" className="text-xs"><ScrollText className="mr-1 h-3.5 w-3.5" />{tb("logsTab")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 px-3 pb-3">
                  {libraryTab === "alerts" ? filteredAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      draggable={canEditBoard}
                      onDragStart={(event) => onDragStart(event, {
                        nodeType: "alert",
                        refId: alert.id,
                        label: alert.title,
                        subtitle: `${alert.source} - ${new Date(alert.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`,
                        severity: alert.severity,
                        status: alert.status,
                        type: alert.type,
                        source: alert.source,
                        provider: alert.provider,
                        category: alert.category,
                        eventCode: alert.eventCode,
                        eventName: alert.eventName,
                        actor: alert.actor,
                        resource: alert.resource,
                        ipAddress: alert.ipAddress,
                        summary: alert.summary,
                        description: alert.description,
                        details: buildDetailRows({
                          refId: alert.id,
                          severity: alert.severity,
                          status: alert.status,
                          type: alert.type,
                          source: alert.source,
                          provider: alert.provider,
                          category: alert.category,
                          eventCode: alert.eventCode,
                          eventName: alert.eventName,
                          actor: alert.actor,
                          resource: alert.resource,
                          ipAddress: alert.ipAddress,
                          summary: alert.summary,
                          description: alert.description,
                        }),
                      })}
                      className={cn("overflow-hidden rounded-lg border border-border bg-card p-2 text-xs transition", canEditBoard ? "cursor-grab hover:border-primary/40 hover:bg-secondary/40 active:cursor-grabbing" : "cursor-not-allowed opacity-60")}
                    >
                      <div className="line-clamp-2 break-words font-medium text-foreground">{alert.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{alert.severity}</Badge>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{alert.id}</span>
                      </div>
                    </div>
                  )) : filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      draggable={canEditBoard}
                      onDragStart={(event) => onDragStart(event, {
                        nodeType: "log",
                        refId: log.id,
                        label: log.message || log.id,
                        subtitle: `${log.source} - ${new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`,
                        severity: log.severity,
                        status: log.status,
                        source: log.source,
                        provider: log.provider,
                        category: log.category,
                        eventCode: log.eventCode,
                        eventName: log.eventName,
                        actor: log.actor,
                        resource: log.resource,
                        ipAddress: log.ipAddress,
                        summary: log.summary,
                        message: log.message,
                        details: buildDetailRows({
                          refId: log.id,
                          severity: log.severity,
                          status: log.status,
                          source: log.source,
                          provider: log.provider,
                          category: log.category,
                          eventCode: log.eventCode,
                          eventName: log.eventName,
                          actor: log.actor,
                          resource: log.resource,
                          ipAddress: log.ipAddress,
                          summary: log.summary,
                          message: log.message,
                        }),
                      })}
                      className={cn("overflow-hidden rounded-lg border border-border bg-card p-2 text-xs transition", canEditBoard ? "cursor-grab hover:border-primary/40 hover:bg-secondary/40 active:cursor-grabbing" : "cursor-not-allowed opacity-60")}
                    >
                      <div className="line-clamp-2 font-medium text-foreground">{log.message || log.id}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{log.severity}</Badge>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{log.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div ref={boardPaneRef} className="relative">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-2 py-1 text-xs backdrop-blur-sm">
            <span className="max-w-[220px] truncate text-foreground">{boardName || "Board"}</span>
            {!canEditBoard ? <Badge variant="outline" className="text-[10px]">View only</Badge> : null}
            <span className="text-muted-foreground">{isSaving ? tb("saving") : lastSavedAt ? tb("savedAt", { time: lastSavedAt }) : tb("ready")}</span>
            {loadError ? <span className="text-destructive">{loadError}</span> : null}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!canEditBoard} onClick={() => void persistBoardState()}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {tb("save")}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!canEditBoard} onClick={applyAutoLayout}>
              <LayoutGrid className="mr-1 h-3.5 w-3.5" />
              {tb("layout")}
            </Button>
            <div className="flex items-center gap-1 rounded-md border border-border/80 px-1.5 py-0.5">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <select className="h-6 bg-transparent text-[11px] outline-none" value={selectedEdgeType} disabled={!canEditBoard} onChange={(event) => setSelectedEdgeType(event.target.value)}>
                {EDGE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!canEditBoard} onClick={applyEdgeTypeToExisting}>{tb("apply")}</Button>
            </div>
          </div>

          <div className={cn("h-full w-full", isLoading && "opacity-60")}> 
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onPaneClick={() => setContextMenu(null)}
              onPaneContextMenu={() => setContextMenu(null)}
              onDrop={onDrop}
              onDragOver={(event) => {
                if (!canEditBoard) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy"
              }}
              onInit={(instance) => {
                reactFlowRef.current = instance
                if (pendingViewportRef.current) {
                  instance.setViewport(pendingViewportRef.current, { duration: 280 })
                  pendingViewportRef.current = null
                }
              }}
              fitView
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ type: "smoothstep", animated: true }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} />
              <MiniMap pannable zoomable className="!bg-card/80" nodeColor={(node) => node.data?.nodeType === "alert" ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
              <Controls />
            </ReactFlow>
          </div>

          {contextMenu ? (
            <div className="absolute z-20 min-w-[200px] rounded-md border border-border bg-card p-1.5 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
              {contextMenu.kind === "node" ? (
                <button type="button" className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-secondary/70" onClick={() => deleteNodeById(contextMenu.nodeId)}>Delete node</button>
              ) : (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Link type</div>
                  {EDGE_TYPE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={cn("flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-secondary/70", contextMenu.edgeType === option.value && "bg-secondary/70")} onClick={() => updateEdgeTypeById(contextMenu.edgeId, option.value)}>
                      <span>{option.label}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <button type="button" className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10" onClick={() => deleteEdgeById(contextMenu.edgeId)}>Delete link</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function BoardCanvasPage() {
  return (
    <ReactFlowProvider>
      <BoardCanvasPageInner />
    </ReactFlowProvider>
  )
}
