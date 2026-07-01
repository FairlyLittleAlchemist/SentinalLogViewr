import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeSummary } from "@/lib/alerts/normalization"

export const dynamic = "force-dynamic"

type AlertForSummary = {
  id: string
  title?: string | null
  description?: string | null
  category?: string | null
  source?: string | null
  event_code?: string | null
  event_name?: string | null
  actor?: string | null
  resource?: string | null
  ip_address?: string | null
  parsed_facts?: Record<string, unknown> | null
  summary?: string | null
}

type N8nResolution = {
  linked_alert_id?: string | null
  linked_case_id?: string | null
  alert_title?: string | null
  source?: string | null
  provider?: string | null
  category?: string | null
  alert_type?: string | null
  severity?: string | null
  fingerprint?: string | null
  issue_summary?: string | null
  root_cause?: string | null
  remediation_steps?: string | null
  containment_steps?: string | null
  validation_steps?: string | null
  outcome?: string | null
  tags?: unknown
  [key: string]: unknown
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickText(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const lowered = raw.toLowerCase()
  if (lowered === "null" || lowered === "undefined") return null
  return raw
}

function toTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean)
}

function looksLikeN8nResolution(value: Record<string, unknown>): boolean {
  const keySignals = [
    "fingerprint",
    "issue_summary",
    "root_cause",
    "remediation_steps",
    "containment_steps",
    "validation_steps",
    "outcome",
  ]

  return keySignals.some((key) => pickText(value[key]))
}

function extractN8nResolutionPayload(payload: unknown): N8nResolution | null {
  const queue: unknown[] = [payload]

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue

    if (Array.isArray(current)) {
      for (const entry of current) queue.push(entry)
      continue
    }

    const record = toRecord(current)
    if (!record) continue

    if (looksLikeN8nResolution(record)) {
      return record as N8nResolution
    }

    for (const nestedKey of ["data", "json", "body", "item", "result"]) {
      if (nestedKey in record) queue.push(record[nestedKey])
    }
  }

  return null
}

function summarizeN8nResolution(resolution: N8nResolution): string | null {
  const primary =
    normalizeSummary(resolution.issue_summary)
    ?? normalizeSummary(resolution.root_cause)
    ?? normalizeSummary(resolution.remediation_steps)
    ?? normalizeSummary(resolution.containment_steps)

  if (primary) return primary

  const parts = [
    pickText(resolution.alert_title),
    pickText(resolution.outcome),
    pickText(resolution.severity),
  ].filter(Boolean)

  if (!parts.length) return null
  return parts.join(" - ").slice(0, 220)
}

async function callN8nResolution(alert: AlertForSummary): Promise<N8nResolution> {
  const webhookUrl = process.env.N8N_ALERT_RESOLUTION_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    throw new Error("N8N_ALERT_RESOLUTION_WEBHOOK_URL is not configured")
  }

  const timeoutMs = Math.max(Number(process.env.N8N_ALERT_RESOLUTION_TIMEOUT_MS ?? 15000), 1000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort("n8n timeout"), timeoutMs)

  const authHeader = process.env.N8N_ALERT_RESOLUTION_AUTH_HEADER?.trim() || "x-api-key"
  const authValue = process.env.N8N_ALERT_RESOLUTION_API_KEY?.trim()

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
        id: alert.id,
        title: alert.title ?? "",
        source: alert.source ?? "",
        description: alert.description ?? "",
        ip_address: alert.ip_address ?? "",
        category: alert.category ?? "",
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
    payload = null
  }

  if (!response.ok) {
    throw new Error(`n8n webhook error: HTTP ${response.status} ${response.statusText} ${bodyText}`)
  }

  const extracted = extractN8nResolutionPayload(payload)
  if (!extracted) {
    throw new Error("n8n webhook response did not include a valid resolution payload")
  }

  return {
    linked_alert_id: pickText(extracted.linked_alert_id) ?? alert.id,
    linked_case_id: pickText(extracted.linked_case_id),
    alert_title: pickText(extracted.alert_title) ?? pickText(alert.title),
    source: pickText(extracted.source) ?? pickText(alert.source),
    provider: pickText(extracted.provider) ?? pickText(alert.source),
    category: pickText(extracted.category) ?? pickText(alert.category),
    alert_type: pickText(extracted.alert_type),
    severity: pickText(extracted.severity),
    fingerprint: pickText(extracted.fingerprint),
    issue_summary: pickText(extracted.issue_summary),
    root_cause: pickText(extracted.root_cause),
    remediation_steps: pickText(extracted.remediation_steps),
    containment_steps: pickText(extracted.containment_steps),
    validation_steps: pickText(extracted.validation_steps),
    outcome: pickText(extracted.outcome),
    tags: toTagList(extracted.tags),
  }
}

async function generateLLMSummary(alert: AlertForSummary): Promise<string> {
  const apiKey = process.env.HF_TOKEN
  if (!apiKey) {
    throw new Error("Hugging Face token is not configured. Set HF_TOKEN in .env.local")
  }

  const parsedFacts = alert.parsed_facts ?? {}
  const parts = [
    `Title: ${alert.title ?? "(unknown)"}`,
    `Description: ${alert.description ?? "(no description)"}`,
    `Source: ${alert.source ?? "(unknown)"}`,
    `Category: ${alert.category ?? "(unknown)"}`,
    `Event Code: ${alert.event_code ?? "(unknown)"}`,
    `Event Name: ${alert.event_name ?? "(unknown)"}`,
    `Actor: ${alert.actor ?? "(unknown)"}`,
    `Resource: ${alert.resource ?? "(unknown)"}`,
    `IP Address: ${alert.ip_address ?? "(unknown)"}`,
  ]

  const summaryFacts: string[] = []
  for (const key of ["owner", "classification", "recommendation", "action", "incidentId"]) {
    const value = parsedFacts[key]
    if (value) {
      summaryFacts.push(`${key}: ${String(value)}`)
    }
  }

  if (summaryFacts.length) {
    parts.push(`Parsed facts: ${summaryFacts.join("; ")}`)
  }

  const textToSummarize = parts.join("\n")
  const maxLength = Math.min(textToSummarize.length / 2, 160)

  const modelEndpoints = [
    "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn:fastest",
    "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn",
  ]

  let response: Response | null = null
  let bodyText = ""
  let payload: unknown = null

  for (const endpoint of modelEndpoints) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: textToSummarize,
        parameters: {
          max_length: Math.max(30, Math.floor(maxLength)),
          min_length: 20,
          do_sample: false,
        },
      }),
    })

    bodyText = await response.text()

    try {
      payload = bodyText ? JSON.parse(bodyText) : null
    } catch {
      payload = null
    }

    if (response.ok && payload) {
      break
    }

    if (response.status === 404) {
      continue
    }

    break
  }

  if (!response) {
    throw new Error("Hugging Face API error: no available model endpoint")
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Hugging Face API error: model endpoint not found (404)")
    }
    throw new Error(`Hugging Face API error: HTTP ${response.status} ${response.statusText}: ${bodyText}`)
  }

  let parsedPayload: unknown = null
  try {
    parsedPayload = bodyText ? JSON.parse(bodyText) : null
  } catch {
    throw new Error(`Hugging Face API error: invalid JSON response ${bodyText}`)
  }

  const payloadArray = Array.isArray(parsedPayload) ? parsedPayload : []
  const summaryCandidate = payloadArray[0] && typeof payloadArray[0] === "object"
    ? String((payloadArray[0] as Record<string, unknown>).summary_text ?? "").trim()
    : (parsedPayload && typeof parsedPayload === "object"
      ? String((parsedPayload as Record<string, unknown>).summary_text ?? "").trim()
      : "")

  if (!summaryCandidate) {
    throw new Error("No summary generated by Hugging Face")
  }

  let cleaned = summaryCandidate.replace(/\n/g, " ")
  cleaned = cleaned
    .replace(/^summary\s*[:\-\s]*/i, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) {
    throw new Error("No usable summary generated by Hugging Face")
  }

  if (cleaned.length < 60 && alert.description && alert.description.trim().length > 40) {
    const snippet = alert.description.trim().slice(0, 240)
    cleaned = `${alert.title ? `${alert.title.trim()}: ` : ""}${snippet}`
  }

  return cleaned.slice(0, 220)
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("id,title,description,category,source,event_code,event_name,actor,resource,ip_address,parsed_facts,summary")
    .eq("id", id)
    .maybeSingle<AlertForSummary>()

  if (alertError) {
    return NextResponse.json({ error: alertError.message }, { status: 500 })
  }

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  if (alert.summary?.trim()) {
    return NextResponse.json({ summary: alert.summary, cached: true, provider: "cache" })
  }

  let generated: string | null = null
  let provider: "n8n" | "huggingface" = "huggingface"
  let resolution: N8nResolution | null = null
  let n8nError: string | null = null

  if (process.env.N8N_ALERT_RESOLUTION_WEBHOOK_URL?.trim()) {
    try {
      resolution = await callN8nResolution(alert)
      generated = summarizeN8nResolution(resolution)
      provider = "n8n"
    } catch (err) {
      n8nError = String(err instanceof Error ? err.message : err)
      console.error("n8n resolution failed, fallback to Hugging Face", {
        alertId: id,
        error: n8nError,
      })
    }
  }

  if (!generated) {
    try {
      generated = await generateLLMSummary(alert)
      provider = "huggingface"
    } catch (err) {
      const hfError = String(err instanceof Error ? err.message : err)
      const mergedError = n8nError
        ? `n8n error: ${n8nError}; huggingface error: ${hfError}`
        : hfError
      return NextResponse.json({ error: mergedError }, { status: 500 })
    }
  }

  const updatePayload: {
    summary: string
    parsed_facts?: Record<string, unknown>
  } = {
    summary: generated,
  }

  if (resolution) {
    updatePayload.parsed_facts = {
      ...(alert.parsed_facts ?? {}),
      n8nResolution: resolution,
    }
  }

  const { error: updateError } = await supabase
    .from("alerts")
    .update(updatePayload)
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    summary: generated,
    cached: false,
    provider,
    resolution,
    warning: n8nError ?? undefined,
  })
}
