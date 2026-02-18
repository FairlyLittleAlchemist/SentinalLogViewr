"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslations } from "next-intl"
import { ArrowRight, FolderTree, Plus, UserCircle2 } from "lucide-react"

type BoardSummary = {
  id: string
  name: string
  isShared: boolean
  caseId?: string | null
  createdAt?: string
  updatedAt?: string
  parentBoardId?: string | null
  boardType?: "master_shared" | "sub_shared" | "personal" | null
}

type PermissionPayload = { permissions?: string[] }

type CaseGroup = {
  caseId: string
  master: BoardSummary | null
  subs: BoardSummary[]
}

function boardTypeLabel(board: BoardSummary) {
  if (board.boardType === "master_shared") return "Master"
  if (board.boardType === "sub_shared") return "Sub"
  if (board.boardType === "personal") return "Personal"
  return "Board"
}

function formatTime(value?: string) {
  if (!value) return "-"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

export default function BoardIndexPage() {
  const t = useTranslations("pages")
  const searchParams = useSearchParams()
  const caseIdParam = (searchParams.get("caseId") ?? "").trim()
  const forceSeed = searchParams.get("seed") === "1"

  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [tab, setTab] = useState<"case" | "personal">(caseIdParam ? "case" : "personal")
  const [newBoardName, setNewBoardName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canCreateCase = permissions.includes("boards.create_case")
  const canCreatePersonal = permissions.includes("boards.create_personal")

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [boardsRes, permsRes] = await Promise.all([
        fetch("/api/boards", { cache: "no-store" }),
        fetch("/api/me/permissions", { cache: "no-store" }),
      ])

      if (!boardsRes.ok) throw new Error(`Failed to load boards (${boardsRes.status})`)
      const boardsPayload = await boardsRes.json() as { boards?: BoardSummary[] }
      setBoards(boardsPayload.boards ?? [])

      if (permsRes.ok) {
        const permsPayload = await permsRes.json() as PermissionPayload
        setPermissions(permsPayload.permissions ?? [])
      } else {
        setPermissions([])
      }

      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load boards")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const caseBoards = useMemo(
    () => boards.filter((board) => board.boardType !== "personal" && board.caseId),
    [boards]
  )

  const personalBoards = useMemo(
    () => boards.filter((board) => board.boardType === "personal"),
    [boards]
  )

  const caseGroups = useMemo(() => {
    const byCase = new Map<string, BoardSummary[]>()
    for (const board of caseBoards) {
      const caseId = String(board.caseId)
      const list = byCase.get(caseId) ?? []
      list.push(board)
      byCase.set(caseId, list)
    }

    const groups: CaseGroup[] = []
    for (const [caseId, list] of byCase.entries()) {
      const master = list.find((item) => item.boardType === "master_shared")
        ?? list.find((item) => !item.parentBoardId)
        ?? null
      const subs = list
        .filter((item) => item.id !== master?.id)
        .sort((a, b) => (new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()))
      groups.push({ caseId, master, subs })
    }

    groups.sort((a, b) => {
      if (a.caseId === caseIdParam) return -1
      if (b.caseId === caseIdParam) return 1
      const aTime = new Date(a.master?.updatedAt ?? 0).getTime()
      const bTime = new Date(b.master?.updatedAt ?? 0).getTime()
      return bTime - aTime
    })

    return groups
  }, [caseBoards, caseIdParam])

  const createBoard = useCallback(async (kind: "master_shared" | "sub_shared" | "personal", caseId?: string) => {
    const targetCaseId = (caseId ?? caseIdParam) || null
    const defaultName = kind === "master_shared"
      ? `Case ${String(targetCaseId).slice(0, 8)} Master`
      : kind === "sub_shared"
        ? `Case ${String(targetCaseId).slice(0, 8)} Sub`
        : targetCaseId
          ? `My ${String(targetCaseId).slice(0, 8)} Personal`
          : "My Personal Board"

    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newBoardName.trim() || defaultName,
        caseId: targetCaseId,
        boardType: kind,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error ?? `Failed to create board (${response.status})`)
    }

    const payload = await response.json() as { board?: BoardSummary }
    setNewBoardName("")
    await loadData()
    return payload.board?.id ?? null
  }, [caseIdParam, loadData, newBoardName])

  const createCaseMaster = async (caseId: string) => {
    try {
      const id = await createBoard("master_shared", caseId)
      if (id) window.location.href = `/board/${id}?seed=1`
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create master board")
    }
  }

  const createCaseSub = async (caseId: string) => {
    try {
      const id = await createBoard("sub_shared", caseId)
      if (id) window.location.href = `/board/${id}?seed=1`
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create sub-board")
    }
  }

  const createPersonal = async () => {
    try {
      const id = await createBoard("personal", caseIdParam || undefined)
      if (id) window.location.href = `/board/${id}`
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create personal board")
    }
  }

  return (
    <DashboardLayout>
      <AppHeader title={t("board")} />
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 lg:p-6">
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Board Workspace</h2>
                <p className="text-sm text-muted-foreground">Choose a case board or personal board before opening the canvas.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{caseBoards.length} case boards</Badge>
                <Badge variant="outline">{personalBoards.length} personal boards</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="Optional board name"
                className="h-8 max-w-sm"
              />
              <Button size="sm" variant="outline" disabled={!canCreatePersonal} onClick={() => void createPersonal()}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create Personal
              </Button>
            </div>
            {caseIdParam ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Case context: <span className="font-mono text-foreground">{caseIdParam}</span>
              </div>
            ) : null}
            {error ? <div className="text-xs text-destructive">{error}</div> : null}
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "case" | "personal")}> 
          <TabsList className="grid w-[320px] grid-cols-2">
            <TabsTrigger value="case"><FolderTree className="mr-1 h-3.5 w-3.5" />Case Boards</TabsTrigger>
            <TabsTrigger value="personal"><UserCircle2 className="mr-1 h-3.5 w-3.5" />Personal Boards</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading boards...</CardContent></Card> : null}

        {!loading && tab === "case" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {caseIdParam && !caseGroups.some((group) => group.caseId === caseIdParam) ? (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Case {caseIdParam.slice(0, 8)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground">No boards for this case yet.</div>
                  <Button size="sm" variant="outline" disabled={!canCreateCase} onClick={() => void createCaseMaster(caseIdParam)}>Create Master</Button>
                </CardContent>
              </Card>
            ) : null}
            {caseGroups.map((group) => (
              <Card key={group.caseId} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">Case {group.caseId.slice(0, 8)}</CardTitle>
                    <div className="flex items-center gap-2">
                      {!group.master ? (
                        <Button size="sm" variant="outline" disabled={!canCreateCase} onClick={() => void createCaseMaster(group.caseId)}>Create Master</Button>
                      ) : null}
                      {group.master ? (
                        <Button size="sm" variant="outline" disabled={!canCreateCase || group.subs.length >= 3} onClick={() => void createCaseSub(group.caseId)}>Add Sub</Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {group.master ? (
                    <Link href={`/board/${group.master.id}${forceSeed ? "?seed=1" : ""}`} className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 hover:bg-primary/10">
                      <div>
                        <div className="font-medium text-foreground">{group.master.name}</div>
                        <div className="text-muted-foreground">{boardTypeLabel(group.master)} · updated {formatTime(group.master.updatedAt)}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ) : (
                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground">No master board yet.</div>
                  )}

                  {group.subs.length > 0 ? group.subs.map((board) => (
                    <Link key={board.id} href={`/board/${board.id}${forceSeed ? "?seed=1" : ""}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40">
                      <div>
                        <div className="font-medium text-foreground">{board.name}</div>
                        <div className="text-muted-foreground">{boardTypeLabel(board)} · updated {formatTime(board.updatedAt)}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  )) : (
                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground">No sub-boards yet.</div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!caseGroups.length ? <Card><CardContent className="p-4 text-sm text-muted-foreground">No case boards found.</CardContent></Card> : null}
          </div>
        ) : null}

        {!loading && tab === "personal" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {personalBoards.map((board) => (
              <Card key={board.id} className="border-border bg-card">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium text-foreground">{board.name}</div>
                    <div className="text-xs text-muted-foreground">{boardTypeLabel(board)} · updated {formatTime(board.updatedAt)}</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/board/${board.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
            {!personalBoards.length ? <Card><CardContent className="p-4 text-sm text-muted-foreground">No personal boards yet.</CardContent></Card> : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
