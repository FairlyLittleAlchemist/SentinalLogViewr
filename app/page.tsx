"use client";

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

type PythonRagResult = {
  source: string
  query?: string
  method_used?: string
  results_count?: number
  results?: Array<{
    alert_title?: string
    category?: string
    remediation_steps?: string
    confidence?: number
    method?: string
    root_cause?: string
  }>
}

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const [ragQuery, setRagQuery] = useState("")
  const [ragLoading, setRagLoading] = useState(false)
  const [ragError, setRagError] = useState<string | null>(null)
  const [ragResult, setRagResult] = useState<PythonRagResult | null>(null)

  const handleRagSearch = async () => {
    const query = ragQuery.trim()
    if (!query) {
      setRagError("Entrez un mot-clé pour rechercher.")
      setRagResult(null)
      return
    }

    setRagError(null)
    setRagResult(null)
    setRagLoading(true)

    try {
      const response = await fetch(`/api/python-rag?q=${encodeURIComponent(query)}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Impossible de récupérer la recommandation.")
      }

      // LOG pour déboguer
      console.log("RAG API Response complète:", JSON.stringify(payload, null, 2))
      console.log("Nombre de résultats:", payload.results?.length)
      if (payload.results && payload.results[0]) {
        console.log("Longueur remediation_steps:", payload.results[0].remediation_steps?.length)
        console.log("Contenu remediation_steps:", payload.results[0].remediation_steps)
      }

      setRagResult(payload)
    } catch (error) {
      setRagError(error instanceof Error ? error.message : "Erreur inconnue")
    } finally {
      setRagLoading(false)
    }
  }

  // --- NOUVELLE FONCTION RENDERSTEPS ICI ---
  const renderSteps = (steps?: string) => {
    if (!steps) {
      return <p className="text-sm text-muted-foreground">Aucune étape de remédiation disponible.</p>
    }

    // LOG DÉBOGAGE
    console.log("=== renderSteps LOG ===")
    console.log("Type du paramètre steps:", typeof steps)
    console.log("Longueur totale:", steps.length)
    console.log("Premiers 100 caractères:", steps.substring(0, 100))
    console.log("Derniers 100 caractères:", steps.substring(Math.max(0, steps.length - 100)))
    console.log("Contenu complet:", steps)
    console.log("=====================")

    let stepsArray: string[] = [];

    try {
      // Si c'est du JSON (commence par [), on le parse
      if (steps.trim().startsWith('[')) {
        stepsArray = JSON.parse(steps);
      } else {
        // Sinon, on split par les retours à la ligne
        stepsArray = steps.split(/\r?\n/).filter(Boolean);
      }
    } catch (error) {
      stepsArray = [steps];
    }

    console.log("Nombre d'étapes après parsing:", stepsArray.length)
    stepsArray.forEach((step, i) => console.log(`Étape ${i} (${step.length} chars):`, step))

    return (
      <ul 
        className="w-full space-y-2 text-sm text-foreground list-disc pl-5 break-words"
        style={{ 
          wordWrap: 'break-word',
          overflow: 'visible !important' as any,
          whiteSpace: 'normal',
          maxHeight: 'none !important' as any,
          height: 'auto !important' as any,
          minHeight: 'auto'
        }}
      >
        {stepsArray.map((step, index) => (
          <li 
            key={index}
            className="break-words whitespace-normal leading-6"
            style={{ 
              wordWrap: 'break-word',
              whiteSpace: 'normal',
              overflow: 'visible !important' as any,
              display: 'list-item',
              maxHeight: 'none !important' as any,
              height: 'auto !important' as any,
              minHeight: 'auto'
            }}
          >
            {/* Nettoyage des guillemets inutiles si présents dans le JSON */}
            {step.replace(/^["']|["']$/g, '')}
          </li>
        ))}
      </ul>
    )
  }
  // --- FIN ---

  return (
    <DashboardLayout>
      <AppHeader title={t("headerTitle")} />
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex flex-col gap-6 p-4 lg:p-6 w-full">
          <div className="rounded-2xl border border-border bg-background p-4 shadow-sm w-full overflow-visible" style={{ maxHeight: 'none' }}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={ragQuery}
                onChange={(event) => setRagQuery(event.target.value)}
                placeholder="Rechercher une recommandation par mot-clé"
                className="flex-1"
              />
              <Button
                onClick={handleRagSearch}
                disabled={ragLoading || !ragQuery.trim()}
                className="h-11 px-4"
              >
                {ragLoading ? "Recherche..." : "Rechercher"}
              </Button>
            </div>
            
            {ragError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive break-words whitespace-normal">
                {ragError}
              </div>
            )}
            
            {ragResult && (
              <div className="mt-4 space-y-4 w-full overflow-visible" style={{ maxHeight: 'none' }}>
                {ragResult.results && ragResult.results.length > 0 ? (
                  ragResult.results.map((result, index) => (
                    <div key={index} className="rounded-xl border border-border p-4 space-y-4 w-full overflow-visible" style={{ maxHeight: 'none' }}>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Résultat {index + 1}</p>
                      <div className="space-y-4 w-full overflow-visible" style={{ maxHeight: 'none' }}>
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Source</p>
                            <p className="mt-2 text-sm font-semibold break-words">{result.method || ragResult.source}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Catégorie</p>
                            <p className="mt-2 text-sm break-words">{result.category ?? "Non détectée"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Confiance</p>
                            <p className="mt-2 text-sm">{result.confidence ? `${Math.round(result.confidence * 100)}%` : "N/A"}</p>
                          </div>
                        </div>
                        <div className="w-full col-span-full overflow-visible" style={{ maxHeight: 'none', gridColumn: '1 / -1' }}>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Étapes de remédiation</p>
                          {renderSteps(result.remediation_steps)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Aucun résultat RAG détaillé disponible.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}