import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const PYTHON_RAG_API_URL = (process.env.PYTHON_RAG_API_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "")

type PythonRagResponse = {
  query?: string
  method_used?: string
  results_count?: number
  results?: Array<Record<string, unknown>>
}

/**
 * Parses a remediation value from the Python RAG into a clean string[].
 * Handles:
 *  - Proper JSON arrays:          ["step1","step2"]
 *  - Python repr lists:           ['step1', "step2"]
 *  - Truncated arrays (no ]):     ["step1","step2
 *  - Newline-separated plain text
 *  - Already-parsed JS arrays
 */
const parseRemediationString = (raw: string): string[] => {
  const trimmed = raw.trim()

  // 1. Standard JSON array — try as-is
  if (trimmed.startsWith("[")) {
    // 1a. Complete array
    if (trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean)
        }
      } catch { /* continue */ }
    }

    // 1b. Truncated array — close it and retry
    const recovered = trimmed.endsWith("]") ? trimmed : trimmed + '"]'
    try {
      const parsed = JSON.parse(recovered)
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean)
      }
    } catch { /* continue */ }

    // 1c. Extract all quoted strings manually (handles both ' and " delimiters)
    //     Uses a regex that matches "..." or '...' allowing escaped quotes inside
    const inner = trimmed.slice(1, trimmed.endsWith("]") ? -1 : undefined)
    const quoted = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)]
    if (quoted.length > 0) {
      return quoted
        .map((m) => (m[1] ?? m[2] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'").trim())
        .filter(Boolean)
    }
  }

  // 2. Newline-separated plain text
  return trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

const normalizeStepList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStepList(item))
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return parseRemediationString(value)
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return normalizeStepList(record.text ?? record.value ?? record.remediation)
  }

  return []
}

const normalizePythonRagResponse = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object") {
    return {
      source: "Python RAG",
      query: "",
      method_used: "unknown",
      results_count: 0,
      results: [],
      data: {
        category: "",
        issue_summary: "Aucune recommandation disponible.",
        root_cause: "",
        remediation_steps: "",
        containment_steps: "",
        validation_steps: "",
        outcome: "",
        confidence: 0,
      },
      alert_type: "RAG",
      severity: "low",
      confidence: 0,
      analysis: "Aucun résultat RAG disponible.",
      remediation_steps: [],
      containment_steps: [],
      validation_steps: [],
      actions: [],
      tags: ["rag"],
    }
  }

  const response = payload as PythonRagResponse
  const normalizedResults = Array.isArray(response.results)
    ? response.results.map((rawResult) => {
      const item = rawResult as Record<string, unknown>
      // Parse the remediation field into a clean string array
      const remediationArray = normalizeStepList(item.remediation ?? item.remediation_steps ?? "")

      return {
        alert_title: String(item.alert_title ?? item.title ?? "").trim(),
        category: String(item.category ?? "").trim(),
        remediation_steps: remediationArray,   // keep as array — no join
        containment_steps: String(item.containment_steps ?? "").trim(),
        validation_steps: String(item.validation_steps ?? "").trim(),
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        similarity: String(item.similarity ?? "").trim(),
        method: String(item.method ?? response.method_used ?? "").trim(),
        outcome: String(item.outcome ?? "").trim(),
        root_cause: String(item.root_cause ?? "").trim(),
      }
    })
    : []

  const firstResult = normalizedResults[0]
  const confidenceValue = firstResult?.confidence ?? 0.75
  const issueSummary = String(firstResult?.alert_title ?? firstResult?.category ?? response.query ?? "").trim()

  return {
    source: String(response.method_used ?? "Python RAG"),
    query: String(response.query ?? ""),
    method_used: String(response.method_used ?? "keyword"),
    results_count: Number(response.results_count ?? normalizedResults.length),
    results: normalizedResults,
    data: {
      category: firstResult?.category ?? "",
      issue_summary: issueSummary || "Aucune recommandation disponible.",
      root_cause: firstResult?.root_cause ?? "",
      // remediation_steps is already a clean array
      remediation_steps: Array.isArray(firstResult?.remediation_steps) ? firstResult.remediation_steps.join("\n") : "",
      containment_steps: firstResult?.containment_steps ?? "",
      validation_steps: firstResult?.validation_steps ?? "",
      outcome: firstResult?.outcome ?? "",
      confidence: confidenceValue,
    },
    alert_type: issueSummary || "RAG recommendation",
    severity: "medium",
    confidence: confidenceValue,
    analysis: issueSummary
      ? `Résultat RAG pour « ${response.query ?? "votre recherche"} » (${response.method_used ?? "keyword"})`
      : "Recommandation générée.",
    // Pass the array directly — no split needed anymore
    remediation_steps: Array.isArray(firstResult?.remediation_steps) ? firstResult.remediation_steps : [],
    containment_steps: firstResult?.containment_steps ? [firstResult.containment_steps] : [],
    validation_steps: firstResult?.validation_steps ? [firstResult.validation_steps] : [],
    actions: [],
    tags: [String(response.method_used ?? "rag").toLowerCase()],
  }
}

export async function GET(request: Request) {
  if (!PYTHON_RAG_API_URL) {
    return NextResponse.json({ error: "PYTHON_RAG_API_URL is not configured" }, { status: 500 })
  }

  const url = new URL(request.url)
  const query = String(url.searchParams.get("q") ?? "").trim()

  if (!query) {
    return NextResponse.json({ error: "Query parameter q is required" }, { status: 400 })
  }

  try {
    const response = await fetch(`${PYTHON_RAG_API_URL}/debug-rag?title=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    // Read raw text first to avoid JSON parse swallowing errors
    const rawText = await response.text()

    // ── DIAGNOSTIC LOG ──────────────────────────────────────────
    console.log("=== RAW Python RAG response (first 2000 chars) ===")
    console.log(rawText.slice(0, 2000))
    console.log("=== END RAW ===")
    // ────────────────────────────────────────────────────────────

    let payload: unknown
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = rawText
    }

    if (!response.ok) {
      const bodyError = typeof payload === "object" && payload !== null
        ? (payload as any)?.detail || (payload as any)?.message
        : String(payload)
      return NextResponse.json({ error: bodyError || "Python RAG error" }, { status: response.status })
    }

    // Log the remediation field of each result BEFORE normalization
    if (payload && typeof payload === "object" && Array.isArray((payload as any).results)) {
      ; (payload as any).results.forEach((r: any, i: number) => {
        console.log(`=== Result[${i}] remediation field (type: ${typeof r.remediation}) ===`)
        console.log(JSON.stringify(r.remediation))
        console.log(`=== Result[${i}] remediation_steps field (type: ${typeof r.remediation_steps}) ===`)
        console.log(JSON.stringify(r.remediation_steps))
      })
    }

    const normalized = normalizePythonRagResponse(payload)

    // Log final remediation_steps sent to frontend
    console.log("=== FINAL remediation_steps sent to frontend ===")
    console.log(JSON.stringify(normalized.remediation_steps))
    console.log("=== END FINAL ===")

    // Fallback LLM déclenché si : aucun résultat RAG OU les steps de remédiation sont vides
    const remediationSteps = normalized.remediation_steps
    const hasValidResults =
      Array.isArray(remediationSteps) &&
      remediationSteps.length > 0

    if (!hasValidResults) {
      try {
        const llmResponse = await fetch(`${new URL(request.url).origin}/api/generate-remediation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, context: "Recherche de recommandation de remédiation" }),
        })

        if (llmResponse.ok) {
          const llmData = await llmResponse.json()
          return NextResponse.json(llmData)
        }
      } catch (llmError) {
        // Continuer avec la réponse RAG même si incomplète
      }
    }

    return NextResponse.json(normalized)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
