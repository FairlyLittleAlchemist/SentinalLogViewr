"use client"

import * as XLSX from "xlsx-js-style"
import { useEffect, useState, useMemo } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { createClient } from "@/lib/supabase/client"
import {
  RefreshCw, ChevronDown, ChevronUp, ShieldCheck,
  Zap, Clock, Search, ArrowUpRight,
  CheckCircle2, Filter, X, BrainCircuit, Activity,
  Server, Cpu, FileText, Download
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IncidentRow {
  id: string
  incident_id: string
  alert_title: string
  classification: string
  severity: string
  remediation_plan: string
  created_at: string
  priority?: string
  sla?: string
  sla_deadline?: string
  tactics?: any
  techniques?: any
  ScoreRisk?: number
  xgb_grade?: string
  xgb_confidence?: number
  xgb_tp?: number
  xgb_fp?: number
  xgb_bp?: number
  xgb_loading?: boolean
}

const GRADE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  TruePositive:   { label: "TP",  bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200",     dot: "bg-red-500" },
  FalsePositive:  { label: "FP",  bg: "bg-slate-50",   text: "text-slate-500",   border: "border-slate-200",   dot: "bg-slate-400" },
  BenignPositive: { label: "BP",  bg: "bg-[#f5f6ef]", text: "text-[#556130]", border: "border-[#d4d9b8]", dot: "bg-[#809047]" },
}

function parseSteps(steps: any): string[] {
  if (!steps) return []
  if (Array.isArray(steps)) return steps.filter(Boolean)
  try {
    if (typeof steps === "string" && steps.trim().startsWith("[")) {
      const parsed = JSON.parse(steps)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [steps]
    }
  } catch { }
  return typeof steps === "string" ? steps.split(/\n/).filter(Boolean) : []
}

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critical: { label: "Critique", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  high: { label: "Élevée", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", dot: "bg-orange-500" },
  medium: { label: "Moyenne", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-500" },
  low: { label: "Faible", bg: "bg-[#f5f6ef]", text: "text-[#556130]", border: "border-[#d4d9b8]", dot: "bg-[#809047]" },
}

function getSev(s: string) {
  return SEVERITY_CONFIG[s?.toLowerCase()] ?? { label: "—", bg: "bg-[#f5f6ef]", text: "text-[#556130]", border: "border-[#d4d9b8]", dot: "bg-[#9eaa6b]" }
}

const PRIORITY_COL_CONFIG: Record<string, { label: string; headerBg: string; headerText: string; countBg: string; countText: string; dot: string }> = {
  High:   { label: "High",   headerBg: "bg-red-100",    headerText: "text-red-700",    countBg: "bg-red-200",    countText: "text-red-700",    dot: "bg-red-500" },
  Medium: { label: "Medium", headerBg: "bg-orange-100", headerText: "text-orange-700", countBg: "bg-orange-200", countText: "text-orange-700", dot: "bg-orange-500" },
  Low:    { label: "Low",    headerBg: "bg-[#809047]",  headerText: "text-white",      countBg: "bg-white/20",   countText: "text-white",      dot: "bg-white" },
}

function getRiskLevel(score: number): { label: string; color: string; bg: string; border: string; track: string } {
  if (score >= 80) return { label: "CRITIQUE", color: "#ef4444", bg: "bg-red-50",     border: "border-red-200",    track: "#fecaca" }
  if (score >= 60) return { label: "ÉLEVÉ",    color: "#f97316", bg: "bg-orange-50",  border: "border-orange-200", track: "#fed7aa" }
  if (score >= 40) return { label: "MOYEN",    color: "#eab308", bg: "bg-yellow-50",  border: "border-yellow-200", track: "#fef08a" }
  return              { label: "FAIBLE",    color: "#809047", bg: "bg-[#f5f6ef]", border: "border-[#d4d9b8]",track: "#d4d9b8" }
}


const MITRE_MAP: Record<string, { tactics: string; techniques: string; logSources: string }> = {
  "Data Security":         { tactics: "TA0009 Collection, TA0010 Exfiltration",            techniques: "T1530, T1048, T1041", logSources: "Microsoft Purview (DLP), SharePoint/OneDrive" },
  "Exfiltration de données":{ tactics: "TA0009 Collection, TA0010 Exfiltration",           techniques: "T1530, T1048, T1041", logSources: "Microsoft Purview (DLP), SharePoint/OneDrive" },
  "Endpoint Security":     { tactics: "TA0002 Execution, TA0005 Defense Evasion",          techniques: "T1059, T1486, T1027", logSources: "Microsoft Defender for Endpoint, Windows Event Logs" },
  "Malware":               { tactics: "TA0002 Execution, TA0005 Defense Evasion",          techniques: "T1059, T1486, T1027", logSources: "Microsoft Defender for Endpoint, Windows Event Logs" },
  "Identity Security":     { tactics: "TA0003 Persistence, TA0004 Privilege Escalation",   techniques: "T1098, T1078, T1548", logSources: "Microsoft Entra ID, Azure AD Sign-in Logs" },
  "Accès non autorisé":    { tactics: "TA0001 Initial Access, TA0006 Credential Access",   techniques: "T1078, T1110, T1133", logSources: "Azure AD Sign-in Logs, Microsoft Entra ID" },
  "Network Security":      { tactics: "TA0001 Initial Access, TA0011 Command and Control", techniques: "T1133, T1071, T1572", logSources: "FortiGate Firewalls, VPN Logs, Azure AD Sign-in Logs" },
  "Brute force":           { tactics: "TA0006 Credential Access",                          techniques: "T1110, T1078",        logSources: "Azure AD Sign-in Logs, Microsoft Defender" },
  "Cloud Security":        { tactics: "TA0006 Credential Access, TA0009 Collection",       techniques: "T1552, T1528, T1530", logSources: "Azure Key Vault, Azure Activity Logs" },
  "Defense Evasion":       { tactics: "TA0005 Defense Evasion",                            techniques: "T1562, T1070",        logSources: "Azure Activity Logs, Microsoft Sentinel" },
  "Email Security":        { tactics: "TA0003 Persistence, TA0009 Collection",             techniques: "T1114, T1098",        logSources: "Exchange Online, Microsoft Defender" },
}

function getSeverityPriority(severity: string): string {
  const s = severity?.toLowerCase()
  if (s === "critical" || s === "high") return "P1"
  if (s === "medium") return "P2"
  return "P3"
}

function cleanText(v: unknown): string {
  return v == null ? "" : String(v).replace(/\r?\n/g, " ").replace(/^["']+|["']+$/g, "").trim()
}

function downloadXLSX(rows: IncidentRow[]) {
  const HEADER_COLOR = "809047"   // olive
  const HEADER_FONT  = "FFFFFF"   // blanc
  const ALT_COLOR    = "F1F2E6"   // olive très clair pour les lignes paires

  const columns = [
    { key: "id",        label: "Use Case ID",              width: 22 },
    { key: "name",      label: "Use Case Name",            width: 45 },
    { key: "cat",       label: "Catégorie",                width: 22 },
    { key: "tactics",   label: "Tactics MITRE Couvertes",  width: 42 },
    { key: "techniques",label: "Techniques MITRE Principales", width: 30 },
    { key: "priority",  label: "Priorité",                 width: 12 },
    { key: "logs",      label: "Log Sources Principales",  width: 45 },
  ]

  const dataRows = rows.map(i => {
    const mitre = MITRE_MAP[i.classification] ?? { tactics: "", techniques: "", logSources: "" }
    const toStr = (v: any): string => {
      if (!v) return ""
      if (Array.isArray(v)) return v.join(", ")
      if (typeof v === "string") {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p.join(", ") : v } catch { return v }
      }
      return ""
    }
    return {
      id:         cleanText(i.incident_id ?? i.id),
      name:       cleanText(i.alert_title),
      cat:        cleanText(i.classification),
      tactics:    toStr(i.tactics)    || mitre.tactics,
      techniques: toStr(i.techniques) || mitre.techniques,
      priority:   getSeverityPriority(i.severity),
      logs:       mitre.logSources,
    }
  })

  const wsData = [
    columns.map(c => c.label),
    ...dataRows.map(r => columns.map(c => (r as Record<string,string>)[c.key])),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths — auto-fit based on content
  ws["!cols"] = columns.map((col, colIdx) => {
    const maxLen = Math.max(
      col.label.length,
      ...dataRows.map(r => String((r as Record<string, string>)[col.key] ?? "").length)
    )
    return { wch: Math.min(Math.max(maxLen + 4, 12), 120) }
  })

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 }

  // Style header row
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C })
    if (!ws[addr]) continue
    ws[addr].s = {
      font:      { bold: true, color: { rgb: HEADER_FONT }, sz: 11 },
      fill:      { fgColor: { rgb: HEADER_COLOR } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: {
        bottom: { style: "medium", color: { rgb: "FFFFFF" } },
        right:  { style: "thin",   color: { rgb: "FFFFFF" } },
      },
    }
  }

  // Style data rows (alternating)
  for (let R = 1; R <= range.e.r; R++) {
    const isAlt = R % 2 === 0
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) ws[addr] = { t: "s", v: "" }
      ws[addr].s = {
        fill:      isAlt ? { fgColor: { rgb: ALT_COLOR } } : { fgColor: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", wrapText: true },
        border: {
          bottom: { style: "thin", color: { rgb: "D4D9B8" } },
          right:  { style: "thin", color: { rgb: "D4D9B8" } },
        },
        font: { sz: 10 },
      }
    }
  }

  // Auto-filter on header
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }

  XLSX.utils.book_append_sheet(wb, ws, "Incidents SOC")
  XLSX.writeFile(wb, `incidents-soc-${new Date().toISOString().slice(0, 10)}.xlsx`, { bookType: "xlsx", cellStyles: true })
}

function RiskScoreGauge({ score }: { score: number }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(score, 100) / 100) * circumference
  const risk = getRiskLevel(score)

  return (
    <div className={cn("flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border shrink-0", risk.bg, risk.border)}>
      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">RISQUE</span>
      <div className="relative w-11 h-11">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={radius} fill="none" stroke={risk.track} strokeWidth="4" />
          <circle
            cx="22" cy="22" r={radius}
            fill="none"
            stroke={risk.color}
            strokeWidth="4"
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] font-black leading-none" style={{ color: risk.color }}>{score}</span>
        </div>
      </div>
    </div>
  )
}



export default function AnalysteDashboard() {
  const supabase = createClient()
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeClassification, setActiveClassification] = useState("all")
  const [activeSeverity, setActiveSeverity] = useState("all")

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from("incident_analysis")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) { console.error(error); setLoading(false); return }

    setIncidents(data || [])
    setLoading(false)
  }

  async function analyzeWithXGB(incident: IncidentRow) {
    const id = incident.id
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, xgb_loading: true } : i))
    try {
      const created = incident.created_at ? new Date(incident.created_at) : null
      const pyWday  = created ? (created.getDay() + 6) % 7 : -1
      const res = await fetch("/api/incident-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:               incident.alert_title ?? "",
          description:         "",
          severity:            incident.severity ?? "informational",
          alert_count:         0,
          rule_count:          0,
          incident_duration_h: -1,
          alert_span_h:        -1,
          create_hour:         created ? created.getHours()   : -1,
          create_weekday:      pyWday,
          create_is_weekend:   pyWday >= 5 ? 1 : pyWday >= 0 ? 0 : -1,
          first_activity_hour: -1,
          title_len:           (incident.alert_title ?? "").length,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setIncidents(prev => prev.map(i => i.id === id ? {
        ...i,
        xgb_grade:      data.label,
        xgb_confidence: data.confidence,
        xgb_tp:         data.probabilities?.TruePositive,
        xgb_fp:         data.probabilities?.FalsePositive,
        xgb_bp:         data.probabilities?.BenignPositive,
        xgb_loading:    false,
      } : i))
    } catch {
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, xgb_loading: false } : i))
    }
  }

  useEffect(() => { fetchData() }, [])

  const alertTypes = useMemo(() =>
    Array.from(new Set(incidents.map(i => i.classification).filter(Boolean))),
    [incidents])

  const filtered = useMemo(() => incidents.filter(i => {
    const matchesSearch = i.alert_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.classification?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = activeClassification === "all" || i.classification === activeClassification
    const matchesSev = activeSeverity === "all" || i.severity?.toLowerCase() === activeSeverity
    return matchesSearch && matchesType && matchesSev
  }), [incidents, searchTerm, activeClassification, activeSeverity])

  const hasFilters = searchTerm || activeClassification !== "all" || activeSeverity !== "all"

  const boardGroups = useMemo(() => {
    const groups: Record<string, IncidentRow[]> = { High: [], Medium: [], Low: [] }
    incidents.forEach(i => {
      const score = i.ScoreRisk ?? null
      const sev   = (i.severity ?? "").toLowerCase()
      const pri   = (i.priority ?? "").toLowerCase()

      // Priority from risk scorer → preferred
      if (pri === "critical" || pri === "high") { groups.High.push(i); return }

      // Score-based classification
      if (score !== null) {
        if (score >= 60)       { groups.High.push(i);   return }
        if (score >= 35)       { groups.Medium.push(i); return }
        groups.Low.push(i); return
      }

      // Fallback: Sentinel severity
      if (sev === "high" || sev === "critical") { groups.High.push(i);   return }
      if (sev === "medium")                     { groups.Medium.push(i); return }
      groups.Low.push(i)
    })
    return groups
  }, [incidents])

  return (
    <DashboardLayout>
      <AppHeader title="Analyste SOC — Intelligence Artificielle" />
      <div className="flex-1 overflow-auto bg-slate-50/60 min-h-0">
        <div className="p-5 lg:p-7 max-w-[1400px] mx-auto space-y-6">



          {/* ── Priority Board ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#809047]" />
                <h2 className="font-bold text-slate-800 text-sm">Priority Tasks & Alerts</h2>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400">
                <span className="text-slate-500">{incidents.length} alertes au total</span>
                <span className="flex items-center gap-1 text-red-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  {boardGroups.High.length} élevées
                </span>
              </div>
            </div>

            <div className="p-4 overflow-x-auto">
              <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                {(["High", "Medium", "Low"] as const).map(key => {
                  const cfg = PRIORITY_COL_CONFIG[key]
                  const group = boardGroups[key] ?? []
                  return (
                    <div key={key} className="w-60 flex-shrink-0">
                      {/* Column header */}
                      <div className={cn("flex items-center justify-between px-3 py-2 rounded-xl mb-2.5", cfg.headerBg)}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                          <span className={cn("text-[11px] font-black", cfg.headerText)}>{cfg.label}</span>
                        </div>
                        <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full", cfg.countBg, cfg.countText)}>
                          {group.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                        {group.length === 0 ? (
                          <div className="py-8 text-center text-slate-300 text-[11px]">Aucune alerte</div>
                        ) : group.map(inc => {
                          const sev = getSev(inc.severity)
                          const isOverdue = inc.sla_deadline && new Date(inc.sla_deadline) < new Date()
                          return (
                            <div
                              key={inc.id}
                              className={cn(
                                "bg-white border rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer",
                                isOverdue ? "border-red-200 bg-red-50/30" : "border-slate-100 hover:border-[#d4d9b8]"
                              )}
                              onClick={() => {
                                setSearchTerm("")
                                setActiveClassification("all")
                                setActiveSeverity("all")
                                setExpandedId(inc.id)
                                setTimeout(() => {
                                  const el = document.getElementById(`incident-${inc.id}`)
                                  if (!el) return
                                  const container = el.closest(".overflow-auto") as HTMLElement | null
                                  if (container) {
                                    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top - 80
                                    container.scrollBy({ top, behavior: "smooth" })
                                  } else {
                                    el.scrollIntoView({ behavior: "smooth", block: "start" })
                                  }
                                }, 150)
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <div className={cn("mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center shrink-0 border", sev.bg, sev.border)}>
                                  <ShieldCheck className={cn("h-3 w-3", sev.text)} />
                                </div>
                                <p className="text-[11px] font-semibold text-slate-700 leading-snug flex-1">{inc.alert_title}</p>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border", sev.bg, sev.text, sev.border)}>
                                  {sev.label.toUpperCase()}
                                </span>
                                <span className="text-[9px] text-slate-400">
                                  {new Date(inc.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                              </div>
                              {inc.sla_deadline && (
                                <div className={cn("mt-1.5 text-[9px] flex items-center gap-1", isOverdue ? "text-red-500 font-bold" : "text-slate-400")}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {isOverdue ? "SLA dépassé — " : "SLA: "}
                                  {new Date(inc.sla_deadline).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            {/* Search + Refresh */}
            <div className="flex flex-col md:flex-row gap-3 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher un incident, une classification..."
                  className="pl-10 h-10 text-sm border-slate-200 bg-slate-50 focus:bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                className="h-10 border-[#e8ebd8] text-[#556130] gap-2 text-xs font-bold shrink-0 hover:bg-[#f5f6ef]"
                onClick={() => { setRefreshing(true); fetchData().then(() => setRefreshing(false)) }}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                ACTUALISER
              </Button>
              <Button
                variant="outline"
                className="h-10 border-slate-200 text-slate-600 gap-2 text-xs font-bold shrink-0 hover:bg-slate-50 hover:border-slate-300"
                onClick={() => downloadXLSX(filtered)}
                disabled={filtered.length === 0}
                title={`Exporter ${filtered.length} incident(s) en Excel`}
              >
                <Download className="h-3.5 w-3.5" />
                EXPORT EXCEL
              </Button>
            </div>

            {/* Filter tabs — severity */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Filter className="h-3 w-3" />Sévérité:</span>
              {["all", "critical", "high", "medium", "low"].map(s => (
                <button
                  key={s}
                  onClick={() => setActiveSeverity(s)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-bold border transition-all",
                    activeSeverity === s
                      ? "bg-[#6b7a3a] text-white border-[#6b7a3a] shadow-sm"
                      : "bg-white text-slate-500 border-slate-200 hover:border-[#d4d9b8] hover:text-[#556130]"
                  )}
                >
                  {s === "all" ? "Tous" : getSev(s).label}
                </button>
              ))}
              <span className="text-slate-200 mx-1">|</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Cpu className="h-3 w-3" />Type:</span>
              <select
                className="h-7 px-2.5 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-600 focus:outline-none cursor-pointer focus:border-[#9eaa6b]"
                value={activeClassification}
                onChange={e => setActiveClassification(e.target.value)}
              >
                <option value="all">Toutes catégories</option>
                {alertTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {hasFilters && (
                <button
                  onClick={() => { setSearchTerm(""); setActiveClassification("all"); setActiveSeverity("all") }}
                  className="ml-auto text-[10px] font-bold text-red-400 hover:text-red-600 flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Effacer filtres
                </button>
              )}
            </div>
          </div>

          {/* ── Incident List ── */}
          <div className="space-y-3">
            {loading ? (
              <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
                <RefreshCw className="h-8 w-8 text-[#809047] animate-spin" />
                <p className="text-sm font-medium">Chargement des incidents...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
                <CheckCircle2 className="h-12 w-12 text-[#d4d9b8]" />
                <p className="text-sm font-semibold text-slate-500">Aucun incident trouvé</p>
                <p className="text-xs">Modifiez vos filtres ou actualisez les données.</p>
              </div>
            ) : filtered.map((incident, idx) => {
              const isOpen = expandedId === incident.id
              const sev = getSev(incident.severity)
              const steps = parseSteps(incident.remediation_plan)

              return (
                <div
                  key={incident.id}
                  id={`incident-${incident.id}`}
                  className={cn(
                    "bg-white rounded-2xl border transition-all duration-200 overflow-hidden",
                    "animate-slide-up",
                    isOpen
                      ? "border-[#bcc391] shadow-lg ring-1 ring-[#e8ebd8]"
                      : "border-slate-100 shadow-sm hover:border-[#d4d9b8] hover:shadow-md"
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  {/* Card header */}
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer select-none"
                    onClick={() => setExpandedId(isOpen ? null : incident.id)}
                  >
                    {/* Severity indicator */}
                    <div className={cn(
                      "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border",
                      sev.bg, sev.border, sev.text
                    )}>
                      <ShieldCheck className="h-5 w-5" />
                    </div>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm truncate max-w-[400px]">
                          {incident.alert_title}
                        </h3>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border",
                          sev.bg, sev.text, sev.border
                        )}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", sev.dot)} />
                          {sev.label.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-bold text-[#556130] bg-[#f5f6ef] px-2 py-0.5 rounded-md border border-[#e8ebd8]">
                          {incident.classification || "Non classifié"}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(incident.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          {" "}
                          {new Date(incident.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          ID {incident.incident_id}
                        </span>
                      </div>
                    </div>

                    {/* Risk gauge + XGB badge + chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                      {incident.ScoreRisk !== undefined && (
                        <RiskScoreGauge score={incident.ScoreRisk} />
                      )}

                      {/* Badge Classification ML */}
                      {incident.xgb_grade ? (() => {
                        const g = GRADE_CONFIG[incident.xgb_grade] ?? GRADE_CONFIG.BenignPositive
                        const fullLabel: Record<string, string> = {
                          TruePositive:   "Vrai Positif",
                          FalsePositive:  "Faux Positif",
                          BenignPositive: "Positif Bénin",
                        }
                        return (
                          <div className={cn("flex flex-col items-center px-2.5 py-1.5 rounded-xl border shrink-0", g.bg, g.border)}>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Classification</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={cn("h-1.5 w-1.5 rounded-full", g.dot)} />
                              <span className={cn("text-[11px] font-black", g.text)}>{fullLabel[incident.xgb_grade] ?? g.label}</span>
                            </div>
                            <span className={cn("text-[9px] font-bold", g.text)}>Confiance {((incident.xgb_confidence ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                        )
                      })() : (
                        <Button
                          variant="ghost"
                          disabled={incident.xgb_loading}
                          size="sm"
                          className="h-8 text-[9px] font-black text-slate-400 border border-dashed border-slate-200 hover:bg-violet-50 hover:text-violet-600 hover:border-violet-300 gap-1.5 px-3"
                          onClick={e => { e.stopPropagation(); analyzeWithXGB(incident) }}
                        >
                          {incident.xgb_loading
                            ? <Activity className="h-3 w-3 animate-spin" />
                            : <BrainCircuit className="h-3.5 w-3.5" />}
                          {incident.xgb_loading ? "Analyse en cours..." : "CLASSIFIER"}
                        </Button>
                      )}

                      <div className={cn("transition-colors", isOpen ? "text-[#809047]" : "text-slate-300")}>
                        {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/40 px-5 pb-5 pt-4">
                      {/* XGBoost detail panel */}
                      {incident.xgb_grade && (() => {
                        const g = GRADE_CONFIG[incident.xgb_grade] ?? GRADE_CONFIG.BenignPositive
                        const bars: { key: string; label: string; val: number; color: string }[] = [
                          { key: "Vrai Positif",    label: "TruePositive",   val: incident.xgb_tp ?? 0, color: "bg-red-500" },
                          { key: "Positif Bénin",   label: "BenignPositive", val: incident.xgb_bp ?? 0, color: "bg-[#809047]" },
                          { key: "Faux Positif",    label: "FalsePositive",  val: incident.xgb_fp ?? 0, color: "bg-slate-400" },
                        ]
                        return (
                          <div className={cn("rounded-xl border p-4 mb-3", g.bg, g.border)}>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2 mb-3">
                              <BrainCircuit className="h-3.5 w-3.5" /> Classification automatique de l'incident
                            </p>
                            <div className="flex items-center gap-3 mb-3">
                              <span className={cn("text-lg font-black px-3 py-1 rounded-lg border", g.bg, g.text, g.border)}>
                                {incident.xgb_grade === "TruePositive" ? "🚨" : incident.xgb_grade === "FalsePositive" ? "✅" : "🔵"}
                                {" "}
                                {{
                                  TruePositive:   "Vrai Positif",
                                  FalsePositive:  "Faux Positif",
                                  BenignPositive: "Positif Bénin",
                                }[incident.xgb_grade] ?? incident.xgb_grade}
                              </span>
                              <div>
                                <p className={cn("font-black text-sm", g.text)}>
                                  {{
                                    TruePositive:   "Incident réel — action requise",
                                    FalsePositive:  "Fausse alerte — peut être ignoré",
                                    BenignPositive: "Activité bénigne — surveillance recommandée",
                                  }[incident.xgb_grade] ?? incident.xgb_grade}
                                </p>
                                <p className="text-[10px] text-slate-500">Niveau de confiance : {((incident.xgb_confidence ?? 0) * 100).toFixed(1)}%</p>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {bars.map(b => (
                                <div key={b.key} className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-500 w-6">{b.key}</span>
                                  <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden border border-white/80">
                                    <div className={cn("h-full rounded-full transition-all duration-700", b.color)} style={{ width: `${(b.val * 100).toFixed(0)}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{(b.val * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Remediation steps */}
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#556130] flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5" /> Plan de Remédiation
                        </p>
                        <div className="bg-white rounded-xl border border-[#e8ebd8] p-4 shadow-sm">
                          {steps.length > 0 ? (
                            <ul className="space-y-3">
                              {steps.map((step, i) => (
                                <li key={i} className="flex gap-3 text-[12.5px] text-slate-700 leading-snug">
                                  <span className="shrink-0 h-6 w-6 bg-[#809047] text-white rounded-lg flex items-center justify-center text-[10px] font-black shadow-sm shadow-[#d4d9b8]">
                                    {i + 1}
                                  </span>
                                  <span className="pt-0.5">{step.replace(/^["']|["']$/g, "")}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-6 text-slate-400">
                              <FileText className="h-8 w-8 opacity-30" />
                              <p className="text-xs italic">Aucun plan de remédiation disponible.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer actions */}
                      <div className="flex justify-between items-center mt-5 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 bg-[#809047] rounded-full animate-pulse" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(incident.created_at).toLocaleString("fr-FR")}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            className="h-9 text-[10px] font-bold px-4 text-slate-500 hover:bg-slate-100"
                            onClick={() => setExpandedId(null)}
                          >
                            Réduire
                          </Button>
                          <Button className="h-9 px-5 rounded-xl bg-[#6b7a3a] hover:bg-[#556130] text-white font-bold text-[10px] gap-2 shadow-md shadow-[#6b7a3a]/20">
                            OUVRIR DANS SENTINEL <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <p className="text-center text-[11px] text-slate-400 font-medium pb-4">
              Affichage de <span className="font-bold text-[#6b7a3a]">{filtered.length}</span> incident{filtered.length > 1 ? "s" : ""} sur {incidents.length} au total
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
