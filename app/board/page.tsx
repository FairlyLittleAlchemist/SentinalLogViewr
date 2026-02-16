"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import dagre from "dagre"
import {
  addEdge,
  MarkerType,
  Background,
  Controls,
  Handle,
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
import { Bell, LayoutGrid, Link2, Save, ScrollText, Sparkles, Wand2 } from "lucide-react"

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

type BoardSummary = {
  id: string
  name: string
  isShared: boolean
  caseId?: string | null
}

type BoardStatePayload = {
  board: {
    id: string
    name: string
    viewport: { x: number; y: number; zoom: number }
  }
  nodes: Node[]
  edges: Edge[]
}

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
      {data.subtitle ? (
        <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{data.subtitle}</div>
      ) : null}
      {data.severity ? (
        <div className="mt-1 text-[10px] uppercase text-muted-foreground">{data.severity}</div>
      ) : null}
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
      <div className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
        Double-click to {data.expanded ? "collapse" : "expand"}
      </div>
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

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: 220, height: 96 })
  })
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  const layouted = nodes.map((node) => {
    const position = graph.node(node.id)
    return {
      ...node,
      position: {
        x: position.x - 110,
        y: position.y - 48,
      },
    }
  })

  return { nodes: layouted, edges }
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
  return formatEdge({
    ...connection,
    id: createNodeId("edge"),
    type: "smoothstep",
    animated: true,
  }, edgeType)
}

function BoardCanvas() {
  const searchParams = useSearchParams()
  const caseIdParam = (searchParams.get("caseId") ?? "").trim()
  const forceSeed = searchParams.get("seed") === "1"
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>("")
  const [newBoardName, setNewBoardName] = useState("Investigation Board")
  const [libraryTab, setLibraryTab] = useState<"alerts" | "logs">("alerts")
  const [librarySearch, setLibrarySearch] = useState("")
  const [alerts, setAlerts] = useState<AlertLibraryItem[]>([])
  const [logs, setLogs] = useState<LogLibraryItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [selectedEdgeType, setSelectedEdgeType] = useState<string>(EDGE_TYPE_OPTIONS[0].value)
  const [contextMenu, setContextMenu] = useState<BoardContextMenuState>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string>("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hydratingBoard, setHydratingBoard] = useState(false)
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const boardPaneRef = useRef<HTMLDivElement | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const caseBootstrapDoneRef = useRef(false)

  useEffect(() => {
    caseBootstrapDoneRef.current = false
  }, [caseIdParam, forceSeed])

  const filteredAlerts = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    if (!needle) return alerts
    return alerts.filter((item) => (
      item.id.toLowerCase().includes(needle) ||
      item.title.toLowerCase().includes(needle) ||
      item.source.toLowerCase().includes(needle)
    ))
  }, [alerts, librarySearch])

  const filteredLogs = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    if (!needle) return logs
    return logs.filter((item) => (
      item.id.toLowerCase().includes(needle) ||
      item.message.toLowerCase().includes(needle) ||
      item.source.toLowerCase().includes(needle)
    ))
  }, [logs, librarySearch])

  const loadBoards = useCallback(async () => {
    const response = await fetch("/api/boards")
    if (!response.ok) throw new Error(`Failed to load boards (${response.status})`)
    const payload = await response.json() as { boards: BoardSummary[] }
    setBoards(payload.boards ?? [])
    return payload.boards ?? []
  }, [])

  const loadLibrary = useCallback(async () => {
    const [alertsRes, logsRes] = await Promise.all([
      fetch("/api/alerts?page=1&pageSize=80&type=all"),
      fetch("/api/logs?page=1&pageSize=80"),
    ])
    if (!alertsRes.ok || !logsRes.ok) {
      throw new Error("Failed to load board library")
    }
    const alertsPayload = await alertsRes.json() as { alerts: AlertLibraryItem[] }
    const logsPayload = await logsRes.json() as { logs: LogLibraryItem[] }
    setAlerts(alertsPayload.alerts ?? [])
    setLogs(logsPayload.logs ?? [])
  }, [])

  const loadBoardState = useCallback(async (boardId: string) => {
    const response = await fetch(`/api/boards/${boardId}`)
    if (!response.ok) throw new Error(`Failed to load board (${response.status})`)
    const payload = await response.json() as BoardStatePayload
    setHydratingBoard(true)
    setNodes(payload.nodes ?? [])
    setEdges(payload.edges ?? [])
    pendingViewportRef.current = payload.board.viewport
    if (reactFlowRef.current && payload.board.viewport) {
      reactFlowRef.current.setViewport(payload.board.viewport, { duration: 280 })
    }
    setHydratingBoard(false)
    return (payload.nodes ?? []).length
  }, [setEdges, setNodes])

  const persistBoardState = useCallback(async () => {
    if (!selectedBoardId || !reactFlowRef.current) return
    setIsSaving(true)
    try {
      const viewport = reactFlowRef.current.getViewport()
      const response = await fetch(`/api/boards/${selectedBoardId}/state`, {
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
  }, [selectedBoardId, nodes, edges])

  const seedCaseBoard = useCallback(async (boardId: string, caseId: string) => {
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
    await fetch(`/api/boards/${boardId}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewport, nodes: seedNodes, edges: seedEdges }),
    })
  }, [setEdges, setNodes])

  useEffect(() => {
    void Promise.all([loadBoards(), loadLibrary()])
      .then(([loadedBoards]) => {
        if (caseBootstrapDoneRef.current) return
        caseBootstrapDoneRef.current = true

        if (caseIdParam) {
          const existing = loadedBoards.find((board) => board.caseId === caseIdParam)
          if (existing) {
            setSelectedBoardId(existing.id)
            void loadBoardState(existing.id).then((count) => {
              if (forceSeed || (count ?? 0) === 0) {
                void seedCaseBoard(existing.id, caseIdParam)
              }
            })
            return
          }

          void (async () => {
            const response = await fetch("/api/boards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: `Case ${caseIdParam.slice(0, 8)} Board`,
                caseId: caseIdParam,
                isShared: false,
              }),
            })
            if (!response.ok) return
            const payload = await response.json() as { board: BoardSummary }
            setBoards((current) => [payload.board, ...current])
            setSelectedBoardId(payload.board.id)
            await seedCaseBoard(payload.board.id, caseIdParam)
          })()
          return
        }

        if (!selectedBoardId && loadedBoards.length > 0) {
          const first = loadedBoards[0]
          setSelectedBoardId(first.id)
          void loadBoardState(first.id)
        }
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Failed to initialize board")
      })
  }, [caseIdParam, forceSeed, loadBoardState, loadBoards, loadLibrary, seedCaseBoard, selectedBoardId])

  useEffect(() => {
    if (!selectedBoardId || hydratingBoard) return
    const timer = setTimeout(() => {
      void persistBoardState()
    }, 900)
    return () => clearTimeout(timer)
  }, [selectedBoardId, nodes, edges, hydratingBoard, persistBoardState])

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

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge(buildTypedEdge(connection, selectedEdgeType), current))
  }, [selectedEdgeType, setEdges])

  const onDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, payload: Record<string, unknown>) => {
    event.dataTransfer.setData("application/x-board-node", JSON.stringify(payload))
    event.dataTransfer.effectAllowed = "copy"
  }, [])

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!reactFlowRef.current) return

    const raw = event.dataTransfer.getData("application/x-board-node")
    if (!raw) return

    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (!payload) return

    const position = reactFlowRef.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    const nodeType = String(payload.nodeType ?? "entity") as ArtifactNodeData["nodeType"]
    const id = createNodeId(nodeType)
    const node: Node = {
      id,
      type: "artifact",
      position,
      data: {
        label: String(payload.label ?? id),
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
              return {
                label: String(record.label ?? "").trim(),
                value: String(record.value ?? "").trim(),
              }
            })
            .filter((item): item is { label: string; value: string } => Boolean(item?.label && item?.value))
          : [],
      } as ArtifactNodeData,
    }

    setNodes((current) => [...current, node])
  }, [setNodes])

  const createBoard = useCallback(async () => {
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newBoardName.trim() || "Investigation Board",
        caseId: caseIdParam || null,
        isShared: false,
      }),
    })
    if (!response.ok) throw new Error(`Failed to create board (${response.status})`)
    const payload = await response.json() as { board: BoardSummary }
    setBoards((current) => [payload.board, ...current])
    setSelectedBoardId(payload.board.id)
    setNodes([])
    setEdges([])
    if (reactFlowRef.current) {
      reactFlowRef.current.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 })
    }
  }, [caseIdParam, newBoardName, setEdges, setNodes])

  const deleteBoard = useCallback(async () => {
    if (!selectedBoardId) return
    const response = await fetch(`/api/boards/${selectedBoardId}`, { method: "DELETE" })
    if (!response.ok) {
      setLoadError(`Failed to delete board (${response.status})`)
      return
    }
    setBoards((current) => current.filter((board) => board.id !== selectedBoardId))
    setSelectedBoardId("")
    setNodes([])
    setEdges([])
    if (reactFlowRef.current) {
      reactFlowRef.current.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 180 })
    }
  }, [selectedBoardId, setEdges, setNodes])

  const applyAutoLayout = useCallback(() => {
    const result = layoutGraph(nodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
  }, [nodes, edges, setEdges, setNodes])

  const applyEdgeTypeToExisting = useCallback(() => {
    setEdges((current) => current.map((edge) => formatEdge(edge, selectedEdgeType)))
  }, [selectedEdgeType, setEdges])

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setNodes((current) => current.map((entry) => {
      if (entry.id !== node.id) return entry
      const nodeData = (entry.data ?? {}) as ArtifactNodeData
      return {
        ...entry,
        data: {
          ...nodeData,
          expanded: !nodeData.expanded,
        },
      }
    }))
  }, [setNodes])

  const getMenuPosition = useCallback((event: React.MouseEvent) => {
    const paneBounds = boardPaneRef.current?.getBoundingClientRect()
    const rawX = event.clientX - (paneBounds?.left ?? 0)
    const rawY = event.clientY - (paneBounds?.top ?? 0)
    const maxX = Math.max(8, (paneBounds?.width ?? 0) - 220)
    const maxY = Math.max(8, (paneBounds?.height ?? 0) - 220)
    return {
      x: Math.min(Math.max(8, rawX), maxX),
      y: Math.min(Math.max(8, rawY), maxY),
    }
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    const position = getMenuPosition(event)
    setContextMenu({ kind: "node", x: position.x, y: position.y, nodeId: node.id })
  }, [getMenuPosition])

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault()
    const position = getMenuPosition(event)
    setContextMenu({
      kind: "edge",
      x: position.x,
      y: position.y,
      edgeId: edge.id,
      edgeType: String(edge.data?.edgeType ?? EDGE_TYPE_OPTIONS[0].value),
    })
  }, [getMenuPosition])

  const deleteNodeById = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((entry) => entry.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    setContextMenu(null)
  }, [setEdges, setNodes])

  const deleteEdgeById = useCallback((edgeId: string) => {
    setEdges((current) => current.filter((entry) => entry.id !== edgeId))
    setContextMenu(null)
  }, [setEdges])

  const updateEdgeTypeById = useCallback((edgeId: string, edgeType: string) => {
    setEdges((current) => current.map((edge) => (
      edge.id === edgeId ? formatEdge(edge, edgeType) : edge
    )))
    setContextMenu(null)
  }, [setEdges])

  return (
    <DashboardLayout>
      <AppHeader title="Investigation Board" />
      <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-0 lg:grid-cols-[300px_1fr]">
        <Card className="rounded-none border-x-0 border-t-0 lg:border-b-0 lg:border-l-0 lg:border-r">
          <CardHeader className="space-y-3">
            <CardTitle className="text-sm">Node Library</CardTitle>
            <div className="flex gap-2">
              <Input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} className="h-8" />
              <Button size="sm" onClick={() => void createBoard()}>Create</Button>
            </div>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={selectedBoardId}
              onChange={(event) => {
                const boardId = event.target.value
                setSelectedBoardId(boardId)
                if (boardId) void loadBoardState(boardId)
              }}
            >
              <option value="">Select board...</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!selectedBoardId}
              onClick={() => {
                if (confirm("Delete this board?")) {
                  void deleteBoard()
                }
              }}
            >
              Delete
            </Button>
            <Input
              placeholder="Search alerts/logs..."
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              className="h-8"
            />
            <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as "alerts" | "logs")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="alerts"><Bell className="mr-1 h-3.5 w-3.5" />Alerts</TabsTrigger>
                <TabsTrigger value="logs"><ScrollText className="mr-1 h-3.5 w-3.5" />Logs</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-18.2rem)]">
              <div className="space-y-2 px-3 pb-3">
                {libraryTab === "alerts" ? filteredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    draggable
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
                    className="cursor-grab rounded-lg border border-border bg-card p-2 text-xs transition hover:border-primary/40 hover:bg-secondary/40 active:cursor-grabbing"
                  >
                    <div className="font-medium text-foreground">{alert.title}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{alert.severity}</Badge>
                      <span className="text-[10px] text-muted-foreground">{alert.id}</span>
                    </div>
                  </div>
                )) : filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    draggable
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
                    className="cursor-grab rounded-lg border border-border bg-card p-2 text-xs transition hover:border-primary/40 hover:bg-secondary/40 active:cursor-grabbing"
                  >
                    <div className="line-clamp-2 font-medium text-foreground">{log.message || log.id}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{log.severity}</Badge>
                      <span className="text-[10px] text-muted-foreground">{log.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div ref={boardPaneRef} className="relative">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-2 py-1 text-xs backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">{isSaving ? "Saving..." : lastSavedAt ? `Saved ${lastSavedAt}` : "Ready"}</span>
            {loadError ? <span className="text-destructive">{loadError}</span> : null}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void persistBoardState()}>
              <Save className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={applyAutoLayout}>
              <LayoutGrid className="mr-1 h-3.5 w-3.5" />
              Layout
            </Button>
            <div className="flex items-center gap-1 rounded-md border border-border/80 px-1.5 py-0.5">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                className="h-6 bg-transparent text-[11px] outline-none"
                value={selectedEdgeType}
                onChange={(event) => setSelectedEdgeType(event.target.value)}
                aria-label="Edge relation type"
              >
                {EDGE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={applyEdgeTypeToExisting}>
                Apply
              </Button>
            </div>
          </div>
          <div className={cn("h-full w-full", !selectedBoardId && "opacity-60")}>
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
              <MiniMap
                pannable
                zoomable
                className="!bg-card/80"
                nodeColor={(node) => node.data?.nodeType === "alert" ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
              />
              <Controls />
            </ReactFlow>
          </div>
          {contextMenu ? (
            <div
              className="absolute z-20 min-w-[200px] rounded-md border border-border bg-card p-1.5 shadow-xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              {contextMenu.kind === "node" ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-secondary/70"
                    onClick={() => deleteNodeById(contextMenu.nodeId)}
                  >
                    Delete node
                  </button>
                </>
              ) : (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Link type
                  </div>
                  {EDGE_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-secondary/70",
                        contextMenu.edgeType === option.value && "bg-secondary/70"
                      )}
                      onClick={() => updateEdgeTypeById(contextMenu.edgeId, option.value)}
                    >
                      <span>{option.label}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => deleteEdgeById(contextMenu.edgeId)}
                  >
                    Delete link
                  </button>
                </>
              )}
            </div>
          ) : null}
          {!selectedBoardId ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-border bg-card/90 px-4 py-3 text-sm text-muted-foreground shadow-lg">
                Create or select a board to start mapping evidence.
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <Wand2 className="h-3.5 w-3.5" />
                  Drag alerts/logs from the library and connect with edges.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function BoardPage() {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  )
}
