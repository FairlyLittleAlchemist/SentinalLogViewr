"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import {
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
  Filter,
  ShieldAlert,
  Activity,
  ShieldCheck,
  Target,
  Zap,
  ListFilter,
  User
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────
interface Classification {
  id: string
  alert_id: string
  alert_title?: string
  category: string
  classification?: string // The user mentioned this column specifically
  severity?: string
  risk_score?: number
  confidence?: number
  tactic?: string
  technique?: string
  source?: string
  created_at: string
}

interface IncidentAnalysis {
  alert_title?: string
  ScoreRisk?: number
}

interface Remediation {
  id: string
  linked_alert_id: string
  alert_title?: string
  issue_summary?: string
  root_cause?: string
  remediation_steps?: string | string[]
  containment_steps?: string | string[]
  validation_steps?: string | string[]
  confidence?: number
}

// Résultat après jointure
interface IncidentRow extends Classification {
  remediation?: Remediation
  displayTitle: string
  displayClassification: string
  scoreRisk?: number
}

// ── Config visuels ─────────────────────────────────────────────
const SEV_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/50", glow: "shadow-[0_0_15px_rgba(239,68,68,0.5)]" },
  high: { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/50", glow: "shadow-[0_0_15px_rgba(249,115,22,0.5)]" },
  medium: { bg: "bg-yellow-500/10", text: "text-yellow-500", border: "border-yellow-500/50", glow: "shadow-[0_0_15px_rgba(234,179,8,0.5)]" },
  low: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/50", glow: "shadow-[0_0_15px_rgba(59,130,246,0.5)]" },
  info: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/50", glow: "" },
}
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const ALL_SEVERITIES = ["critical", "high", "medium", "low", "info"]

// ── Helpers ────────────────────────────────────────────────────
function normalizeId(s?: string | null): string {
  return (s || "").toLowerCase().trim()
}

function parseSteps(steps: string | string[] | undefined): string[] {
  if (!steps) return []
  if (Array.isArray(steps)) return steps.filter(Boolean)
  try {
    if (steps.trim().startsWith("[")) {
      const parsed = JSON.parse(steps)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [steps]
    }
  } catch { /* not JSON */ }
  return steps.split(/\n/).filter(Boolean)
}

function FilterPill({ label, onRemove, isActive, onClick }: { label: string; onRemove?: () => void; isActive?: boolean; onClick?: () => void }) {
  if (isActive !== undefined && onClick) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer",
          isActive ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50" : "bg-transparent text-slate-400 border-slate-600/50 hover:border-slate-400 hover:text-white"
        )}
      >
        {label}
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border bg-indigo-500/20 text-indigo-400 border-indigo-500/50 transition-all hover:scale-105 cursor-pointer" onClick={onRemove}>
      {label}
      <X className="h-3 w-3 ml-1 opacity-70 hover:opacity-100" />
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function AnalysteDashboard() {
  const supabase = createClient()
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [activeSeverity, setActiveSeverity] = useState<string>("all")
  const [activeClassification, setActiveClassification] = useState<string>("all")
  const [availableClassifications, setAvailableClassifications] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState("24h")

  async function fetchData() {
    setLoading(true)

    // 1️⃣ Source principale : alert_classifications
    const { data: classData, error: classError } = await supabase
      .from("alert_classifications")
      .select("*")
      .order("created_at", { ascending: false })

    if (classError) {
      console.error("alert_classifications error:", classError)
      setLoading(false)
      return
    }

    // 2️⃣ Remédiation RAG : alert_resolution_knowledge
    const { data: remData } = await supabase
      .from("alert_resolution_knowledge")
      .select("*")

    // ScoreRisk depuis incident_analysis
    const { data: incidentAnalysisData } = await supabase
      .from("incident_analysis")
      .select("alert_title, ScoreRisk")

    const scoreRiskMap: Record<string, number> = {}
    if (incidentAnalysisData) {
      incidentAnalysisData.forEach((ia: IncidentAnalysis) => {
        if (ia.alert_title && ia.ScoreRisk !== undefined) {
          scoreRiskMap[ia.alert_title.toLowerCase().trim()] = ia.ScoreRisk
        }
      })
    }

    // 3️⃣ Table alerts & incidents : vrai nom de l'alerte/incident
    const { data: alertsData } = await supabase
      .from("alerts")
      .select("*")

    const { data: incidentsData } = await supabase
      .from("incidents")
      .select("*")

    const alertsMap: Record<string, string> = {}

    if (alertsData) {
      alertsData.forEach(a => {
        const title = a.title || a.name || a.activity || a.id
        if (a.id) alertsMap[a.id] = title
        if (a.systemAlertId) alertsMap[a.systemAlertId] = title
        if (a.alert_id) alertsMap[a.alert_id] = title
      })
    }

    if (incidentsData) {
      incidentsData.forEach(i => {
        const title = i.title || i.name || i.incidentNumber || i.id
        if (i.id) alertsMap[i.id] = title
        if (i.incidentNumber) alertsMap[i.incidentNumber] = title
        if (i.systemAlertId) alertsMap[i.systemAlertId] = title
        if (i.name) alertsMap[i.name] = title
      })
    }

    const remMap: Record<string, any> = {}
    if (remData) {
      remData.forEach(r => {
        if (r.linked_alert_id) remMap[normalizeId(r.linked_alert_id)] = r
        if (r.alert_id) remMap[normalizeId(r.alert_id)] = r
        if (r.alert_title) remMap[normalizeId(r.alert_title)] = r
        if (r.title) remMap[normalizeId(r.title)] = r
      })
    }

    // 4️⃣ Joindre tout : classification + remédiation + nom alerte
    const joined: IncidentRow[] = (classData || []).map(cls => {
      const normalizedId = normalizeId(cls.alert_id);
      const classValue = cls.classification || cls.category || "Unknown";

      const foundTitle = alertsMap[normalizedId];
      const displayTitle = foundTitle || cls.alert_title || cls.alert_id;

      // Essayer de trouver la remédiation par ID ou par Titres possibles
      const rem = remMap[normalizedId] ||
        remMap[normalizeId(cls.alert_title)] ||
        remMap[normalizeId(displayTitle)];

      const titleKey = displayTitle?.toLowerCase().trim()
      const titleAltKey = (cls.alert_title || "").toLowerCase().trim()
      const scoreRisk = scoreRiskMap[titleKey] ?? scoreRiskMap[titleAltKey]

      return {
        ...cls,
        displayTitle,
        displayClassification: classValue,
        remediation: rem ?? undefined,
        severity: cls.sevirty || cls.severity || "info",
        scoreRisk,
      }
    })

    // Extraire toutes les classifications uniques pour les filtres
    const uniqueClassifs = Array.from(new Set(joined.map(i => i.displayClassification).filter(Boolean)))
    setAvailableClassifications(uniqueClassifs)

    setIncidents(joined)
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  // Filtrage par sévérité ET par classification ET par temps
  const filtered = incidents
    .filter(i => {
      let matchesTime = true;
      if (timeRange !== "all") {
        const incidentDate = new Date(i.created_at).getTime();
        const now = Date.now();
        const diffHours = (now - incidentDate) / (1000 * 60 * 60);
        if (timeRange === "1h") matchesTime = diffHours <= 1;
        if (timeRange === "24h") matchesTime = diffHours <= 24;
        if (timeRange === "7d") matchesTime = diffHours <= (24 * 7);
      }

      const sev = i.severity?.toLowerCase() || "info"
      const matchesSev = activeSeverity === "all" || sev === activeSeverity
      const matchesClassif = activeClassification === "all" || i.displayClassification === activeClassification

      return matchesTime && matchesSev && matchesClassif
    })
    .sort((a, b) => {
      const sa = SEV_ORDER[a.severity?.toLowerCase() || "info"] ?? 4
      const sb = SEV_ORDER[b.severity?.toLowerCase() || "info"] ?? 4
      return sa - sb
    })

  // Stats
  const total = incidents.length
  const filteredTotal = filtered.length
  const truePositives = incidents.filter(i => i.displayClassification.toLowerCase().includes("true positive") || i.displayClassification.toLowerCase().includes("vrai positif")).length
  const withRem = incidents.filter(i => i.remediation).length

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto bg-slate-50 text-slate-900 min-h-[calc(100vh-64px)] font-sans">

        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 tracking-wide">SOC</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold rounded text-slate-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              Actualiser
            </button>
            <button className="px-4 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold rounded text-slate-700 transition-colors shadow-sm">
              Edit
            </button>
            <button className="px-4 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold rounded text-slate-700 transition-colors shadow-sm">
              Export ▾
            </button>
            <button className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold rounded text-slate-700 transition-colors shadow-sm">
              •••
            </button>
          </div>
        </div>

        <div className="p-6 max-w-[1600px] mx-auto space-y-6">

          {/* Filters Area (Mimicking Splunk Inputs) */}
          <div className="flex flex-wrap items-start gap-6 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Time Range</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-700 min-w-[150px] cursor-pointer outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="1h">Last 1 hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="all">All time</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Classification</span>
              <select
                value={activeClassification}
                onChange={(e) => setActiveClassification(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-700 min-w-[200px] cursor-pointer outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="all">Toutes les classifications</option>
                {availableClassifications.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Severity</span>
              <select
                value={activeSeverity}
                onChange={(e) => setActiveSeverity(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-700 min-w-[150px] cursor-pointer outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="all">Toutes les sévérités</option>
                {ALL_SEVERITIES.map(sev => (
                  <option key={sev} value={sev}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Status</span>
              <div className="bg-white border border-slate-300 rounded p-1 text-xs flex flex-wrap gap-1 min-w-[150px] shadow-sm">
                <button className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded flex items-center gap-1">Unassigned <span className="text-[10px] opacity-60">x</span></button>
              </div>
            </div>

            <div className="mt-5 text-[11px] text-blue-400 font-semibold cursor-pointer hover:underline">
              Hide Filters
            </div>
          </div>

          {/* Splunk-like Panel */}
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm">
            {/* Panel Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Notable Events</h2>
              <div className="text-[11px] text-blue-600 font-semibold flex gap-2">
                <span className="cursor-pointer hover:underline">Select All</span> |
                <span className="cursor-pointer hover:underline">Edit Selected</span> |
                <span className="cursor-pointer hover:underline">Edit All {filteredTotal} Matching Notable Events</span> |
                <span className="cursor-pointer hover:underline">Reset Selection</span>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[40px_30px_30px_30px_100px_100px_minmax(250px,2fr)_130px_130px_120px_110px] bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
              <div className="p-2 border-r border-slate-200 flex items-center justify-center">i</div>
              <div className="p-2 border-r border-slate-200"></div>
              <div className="p-2 border-r border-slate-200"></div>
              <div className="p-2 border-r border-slate-200"></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">Assignee <span>↕</span></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">Status <span>↕</span></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">Alert <span>↕</span></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">alert_time <span>↕</span></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">event_time <span>↕</span></div>
              <div className="p-2 border-r border-slate-200 flex items-center justify-between">cyences_severity <span>↕</span></div>
              <div className="p-2 flex items-center justify-between">Score Risque <span>↕</span></div>
            </div>

            {/* Table Body */}
            <div className="flex flex-col font-mono text-[11px] text-slate-700">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Chargement...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Aucun résultat</div>
              ) : filtered.map((incident, index) => {
                const sev = incident.severity?.toLowerCase() || "info"
                let sevBg = "bg-slate-200 text-slate-700"
                if (sev === "critical" || sev === "high") sevBg = "bg-red-500 text-white"
                else if (sev === "medium") sevBg = "bg-orange-500 text-white"
                else if (sev === "low") sevBg = "bg-green-500 text-white"

                const isOpen = expandedId === incident.id
                const dateStr = new Date(incident.created_at).toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " PDT"

                return (
                  <div key={incident.id} className="flex flex-col">
                    <div
                      className="grid grid-cols-[40px_30px_30px_30px_100px_100px_minmax(250px,2fr)_130px_130px_120px_110px] border-b border-slate-200 hover:bg-slate-50 transition-colors items-stretch cursor-pointer"
                      onClick={() => setExpandedId(isOpen ? null : incident.id)}
                    >
                      <div className="p-2 border-r border-slate-200 flex items-center justify-center text-slate-400">
                        <ChevronRight className={cn("h-3 w-3 transition-transform mr-1", isOpen && "rotate-90 text-slate-900")} />
                        {index + 1}
                      </div>
                      <div className="p-2 border-r border-slate-200 flex items-center justify-center">
                        <input type="checkbox" className="h-3 w-3 opacity-50" onClick={e => e.stopPropagation()} />
                      </div>
                      <div className="p-2 border-r border-slate-200 flex items-center justify-center text-slate-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </div>
                      <div className="p-2 border-r border-slate-200 flex items-center justify-center text-slate-400">
                        <User className="h-3 w-3" />
                      </div>
                      <div className="p-2 border-r border-slate-200 flex items-center">Unassigned</div>
                      <div className="p-2 border-r border-slate-200 flex items-center">Unassigned</div>
                      <div className="p-2 border-r border-slate-200 flex flex-col justify-center gap-1">
                        <span className="font-sans font-semibold leading-tight text-slate-900">{incident.displayTitle}</span>
                        {incident.displayClassification && <span className="text-slate-500 font-sans text-[10px]">{incident.displayClassification}</span>}
                        {incident.remediation && <span className="text-blue-600 font-sans text-[10px] font-bold flex items-center gap-1"><Zap className="h-2 w-2" /> RAG ACTIF</span>}
                      </div>
                      <div className="p-2 border-r border-slate-200 flex items-center text-slate-500">{dateStr}</div>
                      <div className="p-2 border-r border-slate-200 flex items-center text-slate-500">{dateStr}</div>
                      <div className={cn("p-2 border-r border-slate-200 flex items-center justify-center font-bold font-sans uppercase", sevBg)}>
                        {incident.severity || "info"}
                      </div>
                      <div className="p-2 flex flex-col items-center justify-center gap-1">
                        {incident.scoreRisk !== undefined ? (
                          <>
                            <span className={cn(
                              "text-[11px] font-black",
                              incident.scoreRisk >= 70 ? "text-red-600" :
                              incident.scoreRisk >= 40 ? "text-orange-500" : "text-emerald-600"
                            )}>
                              {incident.scoreRisk}
                            </span>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  incident.scoreRisk >= 70 ? "bg-red-500" :
                                  incident.scoreRisk >= 40 ? "bg-orange-400" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(incident.scoreRisk, 100)}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </div>
                    </div>

                    {/* Accordion RAG Remediation */}
                    {isOpen && (
                      <div className="bg-slate-50 border-b border-slate-200 p-6 text-sm font-sans">
                        <div className="max-w-4xl space-y-6">
                          {incident.remediation ? (
                            <div className="space-y-4">
                              {parseSteps(incident.remediation.remediation_steps).length > 0 ? (
                                <div className="bg-green-50 border border-green-200 p-4 rounded-md">
                                  <h3 className="text-xs font-bold uppercase text-green-700 mb-3 flex items-center gap-2 border-b border-green-200 pb-2">
                                    <Zap className="h-4 w-4" /> Étapes de Remédiation (RAG)
                                  </h3>
                                  <ol className="list-decimal list-inside space-y-2 text-slate-700">
                                    {parseSteps(incident.remediation.remediation_steps).map((step, i) => (
                                      <li key={i} className="pl-2 leading-relaxed">{step.replace(/^["']|["']$/g, "")}</li>
                                    ))}
                                  </ol>
                                </div>
                              ) : (
                                <div className="p-4 bg-white border border-slate-200 rounded-md text-slate-500 italic shadow-sm">
                                  Aucune étape de remédiation disponible pour cette alerte.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-4 bg-white border border-slate-200 rounded-md text-slate-500 italic shadow-sm">
                              Le RAG n'a pas encore généré de remédiations pour cette alerte.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
