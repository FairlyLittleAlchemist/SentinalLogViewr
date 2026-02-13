import { flattenForDisplay, parsePayload } from "@/lib/parsing/event-payload"

type EventSummaryOptions = {
  maxItems?: number
  maxValueLength?: number
}

export function parseEventData(payload: string) {
  const parsed = parsePayload(payload)
  const fields = flattenForDisplay(parsed.normalized, { maxItems: 48, maxValueLength: 600 })
  if (!fields.length) return null

  return fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.value
    return acc
  }, {})
}

export function summarizeEventData(payload: string, options: EventSummaryOptions = {}) {
  const parsed = parsePayload(payload)
  if (parsed.kind === "empty") return null

  const fields = flattenForDisplay(parsed.normalized, {
    maxItems: options.maxItems ?? 4,
    maxValueLength: options.maxValueLength ?? 56,
  })

  if (fields.length) {
    return fields.map((field) => `${field.label}: ${field.value}`).join(" | ")
  }

  return parsed.facts.summary || null
}

export function formatEventFieldLabel(key: string) {
  const segments = key.split(".")
  const raw = segments[segments.length - 1] ?? key
  return raw
    .replace(/\[@.*?\]/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
