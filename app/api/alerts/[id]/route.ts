import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "dismissed"]).optional(),
  assignee: z.string().nullable().optional(),
})

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeAssignee(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") return null

  const parsed = safeParseJson(raw)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    const principal = [
      record.assignedTo,
      record.userPrincipalName,
      record.email,
      record.name,
      record.displayName,
      record.objectId,
    ]
      .map((entry) => String(entry ?? "").trim())
      .find((entry) => entry && entry.toLowerCase() !== "null" && entry.toLowerCase() !== "undefined")
    return principal || null
  }

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    return null
  }

  return raw
}

export async function GET(
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

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const { data: override, error: overrideError } = await supabase
    .from("alert_overrides")
    .select("status,assignee")
    .eq("alert_id", id)
    .maybeSingle()

  if (overrideError) {
    return NextResponse.json({ error: overrideError.message }, { status: 500 })
  }

  const alert = {
    id: data.id,
    title: data.title,
    severity: data.severity,
    status: override?.status ?? data.status,
    source: data.source,
    timestamp: data.timestamp,
    description: data.description,
    assignee: normalizeAssignee(override?.assignee) ?? normalizeAssignee(data.assignee),
    tactics: data.tactics,
    affectedEntities: data.affected_entities,
    recommendedActions: data.recommended_actions,
  }

  return NextResponse.json({ alert })
}

export async function PATCH(
  req: Request,
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

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const { data: existing, error: existingError } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (existingError || !existing) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const upsertPayload: {
    alert_id: string
    status?: "new" | "in_progress" | "resolved" | "dismissed"
    assignee?: string | null
    updated_at: string
    updated_by: string
  } = {
    alert_id: id,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }

  if (parsed.data.status !== undefined) {
    upsertPayload.status = parsed.data.status
  }
  if (parsed.data.assignee !== undefined) {
    upsertPayload.assignee = parsed.data.assignee
  }

  const { error: overrideWriteError } = await supabase
    .from("alert_overrides")
    .upsert(upsertPayload, { onConflict: "alert_id" })

  if (overrideWriteError) {
    return NextResponse.json({ error: overrideWriteError.message }, { status: 500 })
  }

  const { data: override, error: overrideError } = await supabase
    .from("alert_overrides")
    .select("status,assignee")
    .eq("alert_id", id)
    .maybeSingle()

  if (overrideError) {
    return NextResponse.json({ error: overrideError.message }, { status: 500 })
  }

  const alert = {
    id: existing.id,
    title: existing.title,
    severity: existing.severity,
    status: override?.status ?? existing.status,
    source: existing.source,
    timestamp: existing.timestamp,
    description: existing.description,
    assignee: normalizeAssignee(override?.assignee) ?? normalizeAssignee(existing.assignee),
    tactics: existing.tactics,
    affectedEntities: existing.affected_entities,
    recommendedActions: existing.recommended_actions,
  }

  return NextResponse.json({ alert })
}
