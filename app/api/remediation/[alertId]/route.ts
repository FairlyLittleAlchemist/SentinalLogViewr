import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type AlertForRemediation = {
  id: string
  title: string
  source: string | null
  description: string | null
  category: string | null
  ip_address: string | null
  severity: string | null
  user: string | null
  actor: string | null
  resource: string | null
}

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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim()
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null
  return text
}

function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
  }

  const text = normalizeText(value)
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    }
  } catch {
    // Keep plain text as a single recommendation step.
  }

  return [text]
}

function parseAction(action: unknown): RemediationAction {
  const record = toRecord(action) ?? {}
  const normalizedType = normalizeText(record.type)
  return {
    id: normalizeText(record.id) ?? `action-${Date.now()}`,
    label: normalizeText(record.label) ?? "Action",
    description: normalizeText(record.description) ?? "",
    command: normalizeText(record.command) ?? "",
    type: normalizedType === "block_ip" || normalizedType === "reset_password" || normalizedType === "isolate_host"
      ? (normalizedType as RemediationAction["type"])
      : "custom",
  }
}

function extractRecommendation(payload: unknown): RagRecommendation | null {
  const record = toRecord(payload)
  if (!record) return null

  const candidate = toRecord(record.recommendation) ?? record

  const alert_type = normalizeText(candidate.alert_type) ?? "Alerte"
  const analysis =
    normalizeText(candidate.analysis)
    ?? normalizeText(candidate.recommendation)
    ?? normalizeText(candidate.recommendation_text)
    ?? normalizeText(candidate.message)
    ?? normalizeText(candidate.n8n_error)
  const remediation_steps = normalizeTextList(candidate.remediation_steps)

  if (!analysis) {
    return null
  }

  const containment_steps = normalizeTextList(candidate.containment_steps)
  const validation_steps = normalizeTextList(candidate.validation_steps)
  const actions = Array.isArray(candidate.actions)
    ? candidate.actions.map(parseAction)
    : []
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean)
    : []

  return {
    alert_type,
    severity: normalizeText(candidate.severity) ?? "medium",
    confidence: Number(candidate.confidence) || 0.5,
    analysis,
    remediation_steps,
    containment_steps,
    validation_steps,
    actions,
    tags,
  }
}

async function callN8nRemediation(alert: AlertForRemediation): Promise<RagRecommendation> {
  const webhookUrl = process.env.N8N_REMEDIATION_RAG_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    throw new Error("N8N_REMEDIATION_RAG_WEBHOOK_URL is not configured")
  }

  const timeoutMs = Math.max(Number(process.env.N8N_REMEDIATION_RAG_TIMEOUT_MS ?? 20000), 1000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort("n8n timeout"), timeoutMs)

  const authHeader = process.env.N8N_REMEDIATION_RAG_AUTH_HEADER?.trim() || "x-api-key"
  const authValue = process.env.N8N_REMEDIATION_RAG_API_KEY?.trim()

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (authValue) {
    headers[authHeader] = authValue
  }

  let response: Response

  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        alert_id: alert.id,
        title: alert.title,
        source: alert.source ?? "",
        description: alert.description ?? "",
        ip_address: alert.ip_address ?? "",
        category: alert.category ?? "",
        severity: alert.severity ?? "",
        user: alert.user ?? "",
        actor: alert.actor ?? "",
        resource: alert.resource ?? "",
        timestamp: new Date().toISOString(),
      }),
    })
  } finally {
    clearTimeout(timeout)
  }

  const bodyText = await response.text()
  let payload: unknown = null

  try {
    payload = bodyText ? JSON.parse(bodyText) : null
  } catch {
    throw new Error(`Invalid JSON from n8n: ${bodyText}`)
  }

  if (!response.ok) {
    throw new Error(`n8n webhook error ${response.status}: ${bodyText}`)
  }

  const recommendation = extractRecommendation(payload)
  if (!recommendation) {
    throw new Error("n8n webhook response does not contain a valid remediation recommendation")
  }

  return recommendation
}

export async function POST(_request: NextRequest, context: { params: Promise<{ alertId: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { alertId } = await context.params
  if (!alertId) {
    return NextResponse.json({ error: "Alert ID is required" }, { status: 400 })
  }

  const { data: alertData, error: alertError } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", alertId)
    .single()

  if (alertError || !alertData) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const alert: AlertForRemediation = {
    id: String(alertData.id),
    title: String(alertData.title ?? ""),
    source: alertData.source ?? null,
    description: alertData.description ?? null,
    category: alertData.category ?? null,
    ip_address: alertData.ip_address ?? null,
    severity: alertData.severity ?? null,
    user: alertData.user ?? null,
    actor: alertData.actor ?? null,
    resource: alertData.resource ?? null,
  }

  try {
    const recommendation = await callN8nRemediation(alert)
    return NextResponse.json({ success: true, recommendation })
  } catch (error) {
    console.error("Remediation n8n error:", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
