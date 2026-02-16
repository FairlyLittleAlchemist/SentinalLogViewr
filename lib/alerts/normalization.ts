type UnknownRecord = Record<string, unknown>

export function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function pickFirstText(values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (!text) continue
    const lowered = text.toLowerCase()
    if (lowered === "null" || lowered === "undefined") continue
    return text
  }
  return ""
}

export function normalizeAssignee(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null

  const lowered = raw.toLowerCase()
  if (lowered === "null" || lowered === "undefined") return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as UnknownRecord
    const principal = pickFirstText([
      record.assignedTo,
      record.userPrincipalName,
      record.email,
      record.name,
      record.displayName,
      record.objectId,
    ])
    return principal || null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  return raw
}

export function normalizeSummary(summary: unknown): string | null {
  const raw = String(summary ?? "").trim()
  if (!raw) return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as UnknownRecord
    const message = pickFirstText([
      record.message,
      record.description,
      record.title,
      record.incidentName,
      record.activity,
    ])
    if (message) return message.slice(0, 220)

    const product = Array.isArray(record.alertProductNames) ? String(record.alertProductNames[0] ?? "").trim() : ""
    const count = String(record.alertsCount ?? "").trim()
    if (product || count) {
      return `${product || "Security incident"}${count ? ` (${count} alerts)` : ""}`.slice(0, 220)
    }
    return null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  if (raw.includes("=") && raw.includes(";") && raw.length > 180) {
    return null
  }

  return raw.slice(0, 220)
}
