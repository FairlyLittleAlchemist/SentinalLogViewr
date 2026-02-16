import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createTimelineSchema = z.object({
  eventType: z.enum(["first_seen", "detection", "triage", "containment", "eradication", "recovery", "post_incident", "custom"]),
  title: z.string().min(2).max(240),
  eventAt: z.string().datetime(),
  details: z.string().max(4000).optional().nullable(),
})

export async function POST(
  request: Request,
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
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = createTimelineSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timeline payload" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("alert_case_timeline_events")
    .insert({
      case_id: id,
      event_type: parsed.data.eventType,
      title: parsed.data.title.trim(),
      event_at: parsed.data.eventAt,
      details: parsed.data.details ?? null,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create timeline event" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "timeline_event_added",
    details: { timelineEventId: data.id, eventType: data.event_type },
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

