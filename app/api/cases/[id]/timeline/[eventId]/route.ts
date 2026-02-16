import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateTimelineSchema = z.object({
  eventType: z.enum(["first_seen", "detection", "triage", "containment", "eradication", "recovery", "post_incident", "custom"]).optional(),
  title: z.string().min(2).max(240).optional(),
  eventAt: z.string().datetime().optional(),
  details: z.string().max(4000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id, eventId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = updateTimelineSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.eventType !== undefined) updates.event_type = parsed.data.eventType
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim()
  if (parsed.data.eventAt !== undefined) updates.event_at = parsed.data.eventAt
  if (parsed.data.details !== undefined) updates.details = parsed.data.details

  const { data, error } = await supabase
    .from("alert_case_timeline_events")
    .update(updates)
    .eq("case_id", id)
    .eq("id", eventId)
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Timeline event not found" }, { status: 404 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "timeline_event_updated",
    details: { timelineEventId: eventId, ...parsed.data },
    created_by: user.id,
  })

  return NextResponse.json({
    timelineEvent: {
      id: data.id,
      eventType: data.event_type,
      title: data.title,
      eventAt: data.event_at,
      details: data.details,
      createdAt: data.created_at,
      createdBy: data.created_by,
    },
  })
}

