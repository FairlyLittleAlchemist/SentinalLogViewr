"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Target,
  Shield,
  User,
  Network,
  Clock,
  Bot,
  Zap,
  XCircle,
  Ban,
  RotateCcw,
} from "lucide-react"
import type { Alert as AlertType } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type RemediationAction = {
  id: string
  label: string
  description: string
  command: string
  type: "block_ip" | "reset_password" | "isolate_host" | "custom"
}

type RagRecommendation = {
  alert_type: string
  severity: string
  confidence: number
  analysis: string
  remediation_steps: string[]
  containment_steps: string[]
  validation_steps: string[]
  actions: RemediationAction[]
  tags: string[]
}

const severityStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-[hsl(45,93%,47%)]/15 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30",
  low: "bg-[hsl(210,90%,56%)]/15 text-[hsl(210,90%,56%)] border-[hsl(210,90%,56%)]/30",
}

const statusIcons = {
  new: AlertTriangle,
  in_progress: Loader2,
  resolved: CheckCircle2,
  dismissed: XCircle,
}

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeList(item))
      .map((item) => String(item).trim())
      // Remove residual JSON escape artifacts e.g. \" at start/end
      .map((item) => item.replace(/^\\"|\\"$/g, "").replace(/^"|"$/g, "").trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()

    // Try parsing as a complete JSON array/object
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        const parsed = JSON.parse(trimmed)
        return normalizeList(parsed)
      } catch {
        // fallback to splitting by delimiters
      }
    }

    // Fallback: try to recover a truncated JSON array (missing closing bracket)
    if (trimmed.startsWith("[") && !trimmed.endsWith("]")) {
      try {
        const recovered = trimmed + "]" // attempt to close the array
        const parsed = JSON.parse(recovered)
        return normalizeList(parsed)
      } catch {
        // fallback: split by comma if it looks like ["a","b"...
        const inner = trimmed.slice(1) // remove leading [
        const items = inner.split(/",\s*"/)
        if (items.length > 1) {
          return items
            .map((s) => s.replace(/^"|"$/g, "").trim())
            .filter(Boolean)
        }
      }
    }

    return trimmed
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof value === "number") {
    return [String(value)]
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.text === "string") {
      return normalizeList(record.text)
    }
    if (typeof record.value === "string") {
      return normalizeList(record.value)
    }
    return normalizeList(record.remediation ?? record.remediation_steps ?? record.value ?? record.text)
  }

  return []
}

const normalizeActions = (value: unknown): RemediationAction[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((action) => {
      if (!action || typeof action !== "object") return null
      const record = action as Record<string, unknown>
      const type = String(record.type ?? "").trim()
      return {
        id: String(record.id ?? `action-${Date.now()}`),
        label: String(record.label ?? "Action"),
        description: String(record.description ?? ""),
        command: String(record.command ?? ""),
        type: type === "block_ip" || type === "reset_password" || type === "isolate_host" ? (type as RemediationAction["type"]) : "custom",
      }
    })
    .filter((item): item is RemediationAction => item !== null)
}

export default function RemediationDashboardPage() {
  const [alerts, setAlerts] = useState<AlertType[]>([])
  const [selectedAlert, setSelectedAlert] = useState<AlertType | null>(null)
  const [recommendation, setRecommendation] = useState<RagRecommendation | null>(null)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [loadingRag, setLoadingRag] = useState(false)
  const [keywordQuery, setKeywordQuery] = useState("")
  const [keywordError, setKeywordError] = useState<string | null>(null)
  const [keywordLoading, setKeywordLoading] = useState(false)
  const [keywordResult, setKeywordResult] = useState<RagRecommendation | null>(null)
  const [executingAction, setExecutingAction] = useState<string | null>(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoadingAlerts(true)
      setAlertsError(null)

      try {
        const response = await fetch("/api/alerts?severity=all&status=all&type=all&pageSize=100")
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || "Failed to fetch alerts")
        }

        const data = await response.json()
        const items = Array.isArray(data.alerts) ? data.alerts : []
        setAlerts(items)
        if (items.length > 0) {
          setSelectedAlert(items[0])
        }
      } catch (error) {
        setAlertsError(error instanceof Error ? error.message : "Unknown error")
      } finally {
        setLoadingAlerts(false)
      }
    }

    fetchAlerts()
  }, [])

  const displayAlerts = useMemo(
    () => alerts.filter((alert) => alert.severity === "critical" || alert.type === "incident" || alert.status === "new"),
    [alerts]
  )

  const handleSelectAlert = async (alert: AlertType) => {
    setSelectedAlert(alert)
    setKeywordResult(null)
    setRecommendation(null)
    setKeywordError(null)
    setLoadingRag(true)

    try {
      const response = await fetch(`/api/remediation/${encodeURIComponent(alert.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
      const data = await response.json()

      if (response.ok && data?.recommendation) {
        setRecommendation(data.recommendation)
      } else if (data?.recommendation) {
        setRecommendation(data.recommendation)
      } else {
        throw new Error(data?.error || "No remediation recommendation returned")
      }
    } catch (error) {
      setRecommendation({
        alert_type: alert.title || "Alerte",
        severity: alert.severity || "medium",
        confidence: 0.5,
        analysis: "Le service RAG local n'a pas répondu. Vérifiez la configuration de l'API.",
        remediation_steps: ["Investigation manuelle requise"],
        containment_steps: ["Isoler les systèmes affectés si nécessaire"],
        validation_steps: ["Vérifier l'intégrité du système"],
        actions: [],
        tags: ["rag_error"],
      })
    } finally {
      setLoadingRag(false)
    }
  }

  const handleKeywordSearch = async (queryOverride?: string) => {
    const query = (queryOverride ?? keywordQuery).trim()
    if (!query) {
      setKeywordError("Entrez un mot-clé pour lancer la recherche.")
      setKeywordResult(null)
      return
    }

    setKeywordError(null)
    setKeywordResult(null)
    setKeywordLoading(true)

    try {
      const response = await fetch(`/api/python-rag?q=${encodeURIComponent(query)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || "Aucune recommandation trouvée.")
      }

      setKeywordResult(data)
      setRecommendation(data)
    } catch (error) {
      setKeywordError(error instanceof Error ? error.message : "Erreur inconnue")
    } finally {
      setKeywordLoading(false)
    }
  }

  const handleScenarioClick = (scenario: string) => {
    setKeywordQuery(scenario)
    handleKeywordSearch(scenario)
  }

  const handleExecuteAction = (action: RemediationAction) => {
    setExecutingAction(action.id)
    setTimeout(() => setExecutingAction(null), 2000)
  }

  const displayRecommendation = keywordResult || recommendation
  const normalizedRecommendation = displayRecommendation
    ? {
      ...displayRecommendation,
      analysis:
        String(displayRecommendation.analysis ?? (displayRecommendation as any).data?.issue_summary ?? displayRecommendation.alert_type ?? "").trim(),
      confidence:
        typeof displayRecommendation.confidence === "number"
          ? displayRecommendation.confidence
          : Number(String(displayRecommendation.confidence ?? (displayRecommendation as any).data?.confidence ?? "").replace(/[^0-9.\-]/g, "")) || 0,
      remediation_steps: normalizeList(
        displayRecommendation.remediation_steps ??
        (displayRecommendation as any).data?.remediation_steps ??
        (displayRecommendation as any).results?.[0]?.remediation_steps ??
        (displayRecommendation as any).results?.[0]?.remediation
      ),
      containment_steps: normalizeList(
        displayRecommendation.containment_steps ??
        (displayRecommendation as any).data?.containment_steps ??
        (displayRecommendation as any).results?.[0]?.containment_steps ??
        (displayRecommendation as any).results?.[0]?.containment
      ),
      validation_steps: normalizeList(
        displayRecommendation.validation_steps ??
        (displayRecommendation as any).data?.validation_steps ??
        (displayRecommendation as any).results?.[0]?.validation_steps ??
        (displayRecommendation as any).results?.[0]?.validation
      ),
      tags: normalizeList(
        displayRecommendation.tags ??
        (displayRecommendation as any).tags ??
        (displayRecommendation as any).method_used ??
        (displayRecommendation as any).source
      ),
      actions: normalizeActions(displayRecommendation.actions ?? (displayRecommendation as any).actions),
    }
    : null

  return (
    <DashboardLayout>
      <div className="flex h-screen flex-col bg-background">
        <AppHeader title="Tableau de recommandations RAG" />

        <main className="flex-1 overflow-hidden p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recherche RAG par mot-clé</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Saisissez un mot-clé pour obtenir une recommandation de remédiation.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={keywordQuery}
                    onChange={(event) => setKeywordQuery(event.target.value)}
                    placeholder="Ex: brute force, traffic forward, local deny"
                    className="flex-1"
                  />
                  <Button onClick={() => handleKeywordSearch()} disabled={keywordLoading || !keywordQuery.trim()}>
                    {keywordLoading ? "Recherche..." : "Chercher"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Brute Force",
                    "Traffic Forward",
                    "Local Deny",
                    "Credential Theft",
                  ].map((scenario) => (
                    <Button
                      key={scenario}
                      variant="outline"
                      onClick={() => handleKeywordSearch(scenario)}
                      disabled={keywordLoading}
                      className="text-xs"
                    >
                      {scenario}
                    </Button>
                  ))}
                </div>
                {keywordError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {keywordError}
                  </div>
                )}
              </CardContent>
            </Card>

            {keywordLoading ? (
              <Card>
                <CardContent className="flex h-64 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Recherche RAG en cours...</p>
                </CardContent>
              </Card>
            ) : normalizedRecommendation ? (
              <Card>
                <CardHeader>
                  <CardTitle>Étapes de remédiation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">Confiance</span>
                        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">{Math.round((normalizedRecommendation.confidence ?? 0) * 100)}%</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-foreground">{normalizedRecommendation.analysis ?? "Aucun résumé disponible."}</p>
                    </div>
                    <div className="w-full rounded-xl border border-border p-4 overflow-visible" style={{ maxHeight: 'none !important' as any, height: 'auto !important' as any }}>
                      <ul className="w-full text-sm space-y-2 list-disc pl-5 break-words" style={{ maxHeight: 'none !important' as any, height: 'auto !important' as any, overflow: 'visible !important' as any }}>
                        {normalizedRecommendation.remediation_steps.length > 0 ? (
                          normalizedRecommendation.remediation_steps.map((step, index) => (
                            <li
                              key={index}
                              className="whitespace-normal break-words leading-6"
                              style={{ maxHeight: 'none !important' as any, height: 'auto !important' as any, overflow: 'visible !important' as any, display: 'list-item' }}
                            >
                              {step}
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">Aucune étape de remédiation disponible.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex h-64 items-center justify-center text-center">
                  <p className="text-muted-foreground">Entrez un mot-clé pour voir les recommandations de remédiation.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  )
}
