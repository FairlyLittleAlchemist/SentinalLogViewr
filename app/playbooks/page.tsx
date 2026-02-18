"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { EXPERIMENTAL_PLAYBOOKS_FLAG } from "@/lib/feature-flags"
import { useAuth } from "@/components/auth/auth-provider"
import { useTranslations } from "next-intl"

type StepStage = "triage" | "investigation" | "containment" | "eradication_recovery" | "post_incident"

type PlaybookStep = {
  id: string
  order: number
  title: string
  details: string | null
  stage: StepStage
  required: boolean
  expectedMinutes: number | null
}

type PlaybookVersion = {
  id: string
  version: number
  status: "draft" | "approved" | "archived"
  approvedAt: string | null
  changeNotes: string | null
}

type Playbook = {
  id: string
  key: string
  name: string
  description: string | null
  alertType: "incident" | "security_event" | "activity" | "firewall" | null
  severity: "low" | "medium" | "high" | "critical" | null
  slaTargetMinutes: number
  strictMode: boolean
  isActive: boolean
  currentVersion: number
  versions: PlaybookVersion[]
  steps: PlaybookStep[]
}

type SocMetrics = {
  mttaMinutes: number | null
  mttrMinutes: number | null
  reopenRate: number
  falsePositiveRate: number
  workload: Array<{ assignee: string; activeCases: number }>
}

const defaultNewPlaybook = {
  key: "",
  name: "",
  alertType: "security_event" as NonNullable<Playbook["alertType"]>,
  severity: "medium" as NonNullable<Playbook["severity"]>,
  slaTargetMinutes: 240,
  strictMode: false,
  steps: [{ title: "", stage: "triage" as StepStage, required: true }],
}

export default function PlaybooksPage() {
  const t = useTranslations("pages")
  const tp = useTranslations("playbooks")
  const { role } = useAuth()
  const canManage = role === "admin"
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [metrics, setMetrics] = useState<SocMetrics | null>(null)
  const [newPlaybook, setNewPlaybook] = useState(defaultNewPlaybook)
  const [changeNotes, setChangeNotes] = useState("")
  const [busy, setBusy] = useState(false)

  const selectedPlaybook = useMemo(
    () => playbooks.find((entry) => entry.id === selectedId) ?? null,
    [playbooks, selectedId]
  )

  const [editorSteps, setEditorSteps] = useState<PlaybookStep[]>([])
  const [editorName, setEditorName] = useState("")
  const [editorDescription, setEditorDescription] = useState("")
  const [editorSla, setEditorSla] = useState(240)
  const [editorStrict, setEditorStrict] = useState(false)
  const [editorActive, setEditorActive] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const [flagsRes, playbooksRes, metricsRes] = await Promise.all([
      fetch("/api/feature-flags", { cache: "no-store" }).catch(() => null),
      fetch("/api/playbooks", { cache: "no-store" }).catch(() => null),
      fetch("/api/metrics/soc", { cache: "no-store" }).catch(() => null),
    ])

    if (flagsRes?.ok) {
      const flagsPayload = await flagsRes.json() as { flags?: Array<{ key: string; enabled: boolean }> }
      setEnabled(Boolean(flagsPayload.flags?.some((flag) => flag.key === EXPERIMENTAL_PLAYBOOKS_FLAG && flag.enabled)))
    } else {
      setEnabled(false)
    }

    if (playbooksRes?.ok) {
      const payload = await playbooksRes.json() as { playbooks?: Playbook[] }
      setPlaybooks(payload.playbooks ?? [])
      if (!selectedId && payload.playbooks?.length) {
        setSelectedId(payload.playbooks[0].id)
      }
    }

    if (metricsRes?.ok) {
      const payload = await metricsRes.json() as SocMetrics
      setMetrics(payload)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedPlaybook) return
    setEditorName(selectedPlaybook.name)
    setEditorDescription(selectedPlaybook.description ?? "")
    setEditorSla(selectedPlaybook.slaTargetMinutes)
    setEditorStrict(selectedPlaybook.strictMode)
    setEditorActive(selectedPlaybook.isActive)
    setEditorSteps(selectedPlaybook.steps.map((step) => ({ ...step })))
  }, [selectedPlaybook])

  const createPlaybook = async () => {
    setBusy(true)
    const res = await fetch("/api/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newPlaybook,
        steps: newPlaybook.steps.filter((step) => step.title.trim()).map((step) => ({
          title: step.title.trim(),
          stage: step.stage,
          required: step.required,
        })),
      }),
    }).catch(() => null)
    if (res?.ok) {
      setNewPlaybook(defaultNewPlaybook)
      await loadData()
    }
    setBusy(false)
  }

  const savePlaybook = async (approveDraft: boolean) => {
    if (!selectedPlaybook) return
    setBusy(true)
    const res = await fetch(`/api/playbooks/${selectedPlaybook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editorName,
        description: editorDescription || null,
        slaTargetMinutes: editorSla,
        strictMode: editorStrict,
        isActive: editorActive,
        steps: editorSteps
          .filter((step) => step.title.trim())
          .map((step) => ({
            title: step.title.trim(),
            details: step.details,
            stage: step.stage,
            required: step.required,
            expectedMinutes: step.expectedMinutes,
          })),
        changeNotes: changeNotes || null,
        approveDraft,
      }),
    }).catch(() => null)
    if (res?.ok) {
      setChangeNotes("")
      await loadData()
    }
    setBusy(false)
  }

  const approveVersion = async (version: number) => {
    if (!selectedPlaybook) return
    await fetch(`/api/playbooks/${selectedPlaybook.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    })
    await loadData()
  }

  const rollbackVersion = async (version: number) => {
    if (!selectedPlaybook) return
    await fetch(`/api/playbooks/${selectedPlaybook.id}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    })
    await loadData()
  }

  if (loading) {
    return <DashboardLayout><AppHeader title={t("playbooks")} /><div className="p-6 text-sm text-muted-foreground">{tp("loading")}</div></DashboardLayout>
  }

  if (!enabled) {
    return (
      <DashboardLayout>
        <AppHeader title={t("playbooks")} />
        <div className="p-6 text-sm text-muted-foreground">{tp("disabled")}</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
        <AppHeader title={t("playbooks")} />
      <div className="flex flex-1 flex-col gap-5 overflow-auto p-4 lg:p-6">
        <p className="text-sm text-muted-foreground">{tp("subtitle")}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tp("metrics.mtta")}</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{Math.round(metrics?.mttaMinutes ?? 0) || "-"}m</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tp("metrics.mttr")}</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{Math.round(metrics?.mttrMinutes ?? 0) || "-"}m</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tp("metrics.reopenRate")}</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{Math.round((metrics?.reopenRate ?? 0) * 100)}%</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{tp("metrics.falsePositive")}</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{Math.round((metrics?.falsePositiveRate ?? 0) * 100)}%</CardContent></Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{tp("library.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {playbooks.map((playbook) => (
                <button
                  key={playbook.id}
                  type="button"
                  onClick={() => setSelectedId(playbook.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selectedId === playbook.id ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{playbook.name}</div>
                    <Badge variant={playbook.isActive ? "default" : "outline"}>{playbook.isActive ? tp("state.active") : tp("state.inactive")}</Badge>
                  </div>
                  <div className="text-muted-foreground">{playbook.key} - v{playbook.currentVersion}</div>
                </button>
              ))}
              {!playbooks.length ? <div className="text-muted-foreground">{tp("library.empty")}</div> : null}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{tp("editor.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selectedPlaybook ? (
                <div className="text-muted-foreground">{tp("editor.selectPlaybook")}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input value={editorName} onChange={(e) => setEditorName(e.target.value)} placeholder={tp("editor.name")} className="h-8" />
                    <Input type="number" min={30} value={editorSla} onChange={(e) => setEditorSla(Number(e.target.value || 30))} className="h-8" />
                    <div className="flex items-center gap-3 rounded border border-border px-2">
                      <Label className="text-xs">{tp("editor.strictMode")}</Label>
                      <Switch checked={editorStrict} onCheckedChange={setEditorStrict} />
                    </div>
                  </div>
                  <Textarea value={editorDescription} onChange={(e) => setEditorDescription(e.target.value)} placeholder={tp("editor.description")} className="min-h-[72px]" />
                  <div className="flex items-center gap-3 rounded border border-border px-2 py-2">
                    <Label className="text-xs">{tp("state.active")}</Label>
                    <Switch checked={editorActive} onCheckedChange={setEditorActive} />
                  </div>
                  <div className="space-y-2">
                    {editorSteps.map((step, index) => (
                      <div key={`${step.id || index}-${index}`} className="grid grid-cols-1 gap-2 rounded border border-border p-2 md:grid-cols-6">
                        <Input value={step.title} onChange={(e) => setEditorSteps((items) => items.map((entry, idx) => idx === index ? { ...entry, title: e.target.value } : entry))} placeholder={tp("editor.stepLabel", { index: index + 1 })} className="h-8 md:col-span-3" />
                        <Select value={step.stage} onValueChange={(value) => setEditorSteps((items) => items.map((entry, idx) => idx === index ? { ...entry, stage: value as StepStage } : entry))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="triage">{tp("stage.triage")}</SelectItem>
                            <SelectItem value="investigation">{tp("stage.investigation")}</SelectItem>
                            <SelectItem value="containment">{tp("stage.containment")}</SelectItem>
                            <SelectItem value="eradication_recovery">{tp("stage.eradication_recovery")}</SelectItem>
                            <SelectItem value="post_incident">{tp("stage.post_incident")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2 rounded border border-border px-2">
                          <Label className="text-xs">{tp("editor.required")}</Label>
                          <Switch checked={step.required} onCheckedChange={(checked) => setEditorSteps((items) => items.map((entry, idx) => idx === index ? { ...entry, required: checked } : entry))} />
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setEditorSteps((items) => items.filter((_, idx) => idx !== index))}>{tp("remove")}</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setEditorSteps((items) => [...items, { id: `new-${items.length + 1}`, order: items.length + 1, title: "", details: null, stage: "triage", required: true, expectedMinutes: null }])}>{tp("editor.addStep")}</Button>
                  </div>
                  <Input value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} placeholder={tp("editor.changeNotes")} className="h-8" />
                  <div className="flex flex-wrap gap-2">
                    {canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void savePlaybook(false)}>{tp("editor.saveDraft")}</Button> : null}
                    {canManage ? <Button size="sm" disabled={busy} onClick={() => void savePlaybook(true)}>{tp("editor.saveApprove")}</Button> : null}
                  </div>
                  <div className="rounded border border-border p-2">
                    <div className="mb-2 text-xs font-medium">{tp("editor.versionHistory")}</div>
                    <div className="space-y-1">
                      {selectedPlaybook.versions.map((version) => (
                        <div key={version.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                          <div className="text-xs">v{version.version} - {tp(`versionStatus.${version.status}`)}</div>
                          <div className="flex items-center gap-1">
                            {canManage ? <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void approveVersion(version.version)}>{tp("approve")}</Button> : null}
                            {canManage ? <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void rollbackVersion(version.version)}>{tp("rollback")}</Button> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {canManage ? <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{tp("create.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <Input value={newPlaybook.key} onChange={(e) => setNewPlaybook((prev) => ({ ...prev, key: e.target.value }))} placeholder="key_name" className="h-8" />
              <Input value={newPlaybook.name} onChange={(e) => setNewPlaybook((prev) => ({ ...prev, name: e.target.value }))} placeholder={tp("editor.name")} className="h-8 md:col-span-2" />
              <Select value={newPlaybook.alertType} onValueChange={(value) => setNewPlaybook((prev) => ({ ...prev, alertType: value as NonNullable<Playbook["alertType"]> }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incident">{tp("alertType.incident")}</SelectItem>
                  <SelectItem value="security_event">{tp("alertType.security_event")}</SelectItem>
                  <SelectItem value="activity">{tp("alertType.activity")}</SelectItem>
                  <SelectItem value="firewall">{tp("alertType.firewall")}</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={30} value={newPlaybook.slaTargetMinutes} onChange={(e) => setNewPlaybook((prev) => ({ ...prev, slaTargetMinutes: Number(e.target.value || 30) }))} className="h-8" />
            </div>
            {newPlaybook.steps.map((step, index) => (
              <div key={`new-step-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                <Input value={step.title} onChange={(e) => setNewPlaybook((prev) => ({ ...prev, steps: prev.steps.map((entry, idx) => idx === index ? { ...entry, title: e.target.value } : entry) }))} placeholder={tp("create.stepTitle", { index: index + 1 })} className="h-8 md:col-span-3" />
                <Select value={step.stage} onValueChange={(value) => setNewPlaybook((prev) => ({ ...prev, steps: prev.steps.map((entry, idx) => idx === index ? { ...entry, stage: value as StepStage } : entry) }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="triage">{tp("stage.triage")}</SelectItem>
                    <SelectItem value="investigation">{tp("stage.investigation")}</SelectItem>
                    <SelectItem value="containment">{tp("stage.containment")}</SelectItem>
                    <SelectItem value="eradication_recovery">{tp("stage.eradication_recovery")}</SelectItem>
                    <SelectItem value="post_incident">{tp("stage.post_incident")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setNewPlaybook((prev) => ({ ...prev, steps: prev.steps.filter((_, idx) => idx !== index) }))}>{tp("remove")}</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewPlaybook((prev) => ({ ...prev, steps: [...prev.steps, { title: "", stage: "triage", required: true }] }))}>{tp("editor.addStep")}</Button>
              <Button size="sm" disabled={busy} onClick={() => void createPlaybook()}>{tp("create.button")}</Button>
            </div>
          </CardContent>
        </Card> : null}
      </div>
    </DashboardLayout>
  )
}
