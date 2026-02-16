import { XMLParser } from "fast-xml-parser"
import JSON5 from "json5"
import { parse as parseLogfmt } from "logfmt"
import { flatten as flattenObjectLib } from "flat"

export type PayloadKind = "json" | "xml" | "kv" | "text" | "empty"

export type NormalizedPayload = Record<string, unknown>

export interface ParsedField {
  key: string
  label: string
  value: string
}

export interface PayloadFacts {
  title: string
  summary: string
  actor: string
  ip: string
  resource: string
  category: string
  action: string
  status: string
  provider: string
  incidentId: string
  classification: string
  owner: string
  alertCount: string
  ruleIds: string[]
}

export interface ParsedPayloadResult {
  kind: PayloadKind
  raw: string
  normalized: NormalizedPayload | null
  facts: PayloadFacts
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: true,
})

function compactWhitespace(value: string | null | undefined) {
  if (!value) return ""
  return value.replace(/\s+/g, " ").trim()
}

function shortValue(value: string, maxLength = 160) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function humanizeToken(value: string) {
  return value
    .replace(/\[@.*?\]/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(value: string) {
  if (!value) return value
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function labelFromPath(path: string) {
  const parts = path.split(".")
  const key = parts[parts.length - 1] || path
  return titleCase(humanizeToken(key))
}

function parseJson(input: string) {
  const trimmed = input.trim()
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    try {
      return JSON5.parse(trimmed)
    } catch {
      return null
    }
  }
}

function parseXml(input: string) {
  const trimmed = input.trim()
  if (!(trimmed.startsWith("<") && trimmed.includes(">"))) {
    return null
  }
  try {
    const parsed = xmlParser.parse(trimmed)
    if (!isRecord(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function parseKeyValue(input: string) {
  if (!input.includes("=")) return null
  try {
    const parsed = parseLogfmt(input.replace(/;/g, "\n"))
    const entries = Object.entries(parsed ?? {}).filter(([, value]) => String(value ?? "").trim() !== "")
    if (entries.length < 2) return null
    return Object.fromEntries(entries)
  } catch {
    return null
  }
}

export function normalizePayload(input: unknown): NormalizedPayload | null {
  if (!input) return null

  if (Array.isArray(input)) {
    return { items: input.map((entry) => normalizePayload(entry) ?? entry) }
  }

  if (!isRecord(input)) return null

  const normalized: Record<string, unknown> = {}

  for (const [key, rawValue] of Object.entries(input)) {
    const cleanKey = key.trim()
    if (!cleanKey) continue

    if (typeof rawValue === "string") {
      const text = rawValue.trim()
      const nestedJson = parseJson(text)
      if (nestedJson) {
        normalized[cleanKey] = normalizePayload(nestedJson) ?? nestedJson
        continue
      }

      const nestedXml = parseXml(text)
      if (nestedXml) {
        normalized[cleanKey] = normalizePayload(nestedXml) ?? nestedXml
        continue
      }

      const nestedKv = parseKeyValue(text)
      if (nestedKv) {
        normalized[cleanKey] = normalizePayload(nestedKv) ?? nestedKv
        continue
      }

      normalized[cleanKey] = compactWhitespace(text)
      continue
    }

    if (Array.isArray(rawValue)) {
      normalized[cleanKey] = rawValue.map((entry) => {
        if (isRecord(entry)) return normalizePayload(entry) ?? entry
        return entry
      })
      continue
    }

    if (isRecord(rawValue)) {
      normalized[cleanKey] = normalizePayload(rawValue) ?? rawValue
      continue
    }

    normalized[cleanKey] = rawValue
  }

  return Object.keys(normalized).length ? normalized : null
}

function flattenObject(
  value: unknown,
  _prefix = "",
  output: Record<string, string> = {},
  _depth = 0
) {
  if (value === null || value === undefined || (!isRecord(value) && !Array.isArray(value))) return output
  const flattened = flattenObjectLib(value as Record<string, unknown>, {
    delimiter: ".",
    safe: true,
  }) as Record<string, unknown>
  for (const [key, raw] of Object.entries(flattened)) {
    if (raw === null || raw === undefined) continue
    output[key] = compactWhitespace(String(raw))
  }
  return output
}

function findValue(flattened: Record<string, string>, candidates: string[]) {
  const entries = Object.entries(flattened)
  for (const candidate of candidates) {
    const lowerCandidate = candidate.toLowerCase()
    for (const [key, value] of entries) {
      if (key.toLowerCase().endsWith(lowerCandidate) && value) {
        return value
      }
    }
  }
  return ""
}

function formatOperationTitle(rawOperation: string) {
  const raw = compactWhitespace(rawOperation)
  if (!raw) return "Event"

  const value = raw.includes("/")
    ? raw.split("/").filter(Boolean).at(-1) ?? raw
    : raw

  const expanded = value
    .replace(/listkeys/gi, "list keys")
    .replace(/listcluster/gi, "list cluster")
    .replace(/clusteruser/gi, "cluster user")
    .replace(/usercredential/gi, "user credential")
    .replace(/admincredential/gi, "admin credential")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return titleCase(expanded)
}

function prettyMessage(value: string) {
  const clean = compactWhitespace(value)
  if (!clean) return ""
  if (clean.includes("/")) {
    return formatOperationTitle(clean)
  }
  return clean
}

export function extractFacts(normalized: NormalizedPayload | null): PayloadFacts {
  const flattened = normalized ? flattenObject(normalized) : {}
  const entries = Object.entries(flattened)

  const action = findValue(flattened, [
    "operationnamevalue",
    "title",
    "incidentname",
    "activity",
    "action",
    "event.action",
    "message",
  ])
  const category = findValue(flattened, [
    "categoryvalue",
    "category",
    "eventcategory",
    "channel",
    "task",
  ])
  const status = findValue(flattened, [
    "activitystatusvalue",
    "status",
    "statuscode",
    "eventoutcome",
  ])
  const provider = findValue(flattened, [
    "providername",
    "resourceprovidervalue",
    "alertproductnames[1]",
    "source",
  ])
  const incidentId = findValue(flattened, [
    "incidentnumber",
    "providerincidentid",
    "incidentid",
    "correlationid",
  ])
  const classification = findValue(flattened, [
    "classification",
    "classificationreason",
  ])
  const owner = findValue(flattened, [
    "owner.userprincipalname",
    "owner.email",
    "owner.assignedto",
    "owner.objectid",
    "assignedto",
  ])
  const alertCount = findValue(flattened, ["alertscount"])
  const ruleIds = entries
    .filter(([key, value]) => key.toLowerCase().includes("relatedanalyticruleids[") && value)
    .map(([, value]) => value)
    .slice(0, 6)
  const actor = findValue(flattened, [
    "caller",
    "account",
    "accountname",
    "subjectusername",
    "targetuser",
    "sourceusername",
  ])
  const resource = findValue(flattened, [
    "resource",
    "entity",
    "resourceid",
    "fullfilepath",
    "filepath",
    "computer",
    "destinationhostname",
  ])
  const ip = findValue(flattened, [
    "calleripaddress",
    "ipaddress",
    "remoteipaddress",
    "clientipaddress",
    "sourceip",
    "destinationip",
  ])

  const summaryParts = [
    prettyMessage(findValue(flattened, ["message", "description"])),
    findValue(flattened, ["title", "incidentname"]) ? `Alert: ${findValue(flattened, ["title", "incidentname"])}` : "",
    findValue(flattened, ["providername", "alertproductnames[1]"]) ? `Provider: ${findValue(flattened, ["providername", "alertproductnames[1]"])}` : "",
    findValue(flattened, ["alertscount"]) ? `Alerts: ${findValue(flattened, ["alertscount"])}` : "",
    category ? `Category: ${category}` : "",
    status ? `Status: ${status}` : "",
    resource ? `Resource: ${resource}` : "",
  ].filter(Boolean)

  const fallbackPairs = Object.entries(flattened)
    .filter(([, value]) => !!value)
    .slice(0, 3)
    .map(([key, value]) => `${labelFromPath(key)}: ${shortValue(value, 64)}`)

  const summary = summaryParts.length
    ? shortValue(summaryParts.join(" | "), 220)
    : fallbackPairs.length
      ? shortValue(fallbackPairs.join(" | "), 220)
      : "Event payload attached. Open details to inspect."

  return {
    title: formatOperationTitle(action || category || "Event"),
    summary,
    actor: actor || "Unknown",
    ip: ip || "Unknown",
    resource: resource || "Unknown",
    category: category || "Unknown",
    action: action || "Unknown",
    status: status || "Unknown",
    provider: provider || "Unknown",
    incidentId: incidentId || "",
    classification: classification || "",
    owner: owner || "",
    alertCount: alertCount || "",
    ruleIds,
  }
}

export function parsePayload(rawInput: string): ParsedPayloadResult {
  const raw = compactWhitespace(rawInput)

  if (!raw) {
    const emptyFacts = extractFacts(null)
    return {
      kind: "empty",
      raw: "",
      normalized: null,
      facts: {
        ...emptyFacts,
        summary: "No event payload available.",
      },
    }
  }

  const jsonValue = parseJson(raw)
  if (jsonValue) {
    const normalized = normalizePayload(jsonValue)
    return {
      kind: "json",
      raw,
      normalized,
      facts: extractFacts(normalized),
    }
  }

  const xmlValue = parseXml(raw)
  if (xmlValue) {
    const normalized = normalizePayload(xmlValue)
    return {
      kind: "xml",
      raw,
      normalized,
      facts: extractFacts(normalized),
    }
  }

  const kvValue = parseKeyValue(raw)
  if (kvValue) {
    const normalized = normalizePayload(kvValue)
    return {
      kind: "kv",
      raw,
      normalized,
      facts: extractFacts(normalized),
    }
  }

  return {
    kind: "text",
    raw,
    normalized: null,
    facts: {
      title: "Event",
      summary: shortValue(raw, 220),
      actor: "Unknown",
      ip: "Unknown",
      resource: "Unknown",
      category: "Unknown",
      action: "Unknown",
      status: "Unknown",
      provider: "Unknown",
      incidentId: "",
      classification: "",
      owner: "",
      alertCount: "",
      ruleIds: [],
    },
  }
}

export function flattenForDisplay(
  normalized: NormalizedPayload | null,
  options: { maxItems?: number; maxValueLength?: number } = {}
): ParsedField[] {
  if (!normalized) return []

  const { maxItems = 16, maxValueLength = 140 } = options
  const flattened = flattenObject(normalized)
  return Object.entries(flattened)
    .filter(([, value]) => !!value)
    .slice(0, maxItems)
    .map(([key, value]) => ({
      key,
      label: labelFromPath(key),
      value: shortValue(compactWhitespace(value), maxValueLength),
    }))
}
