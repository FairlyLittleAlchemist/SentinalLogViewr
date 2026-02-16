import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const updateHypothesisSchema = z.object({
  statement: z.string().min(4).max(2000).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  status: z.enum(["open", "confirmed", "rejected"]).optional(),
  evidenceSummary: z.string().max(4000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; hypothesisId: string }> }
) {
  const { id, hypothesisId } = await params
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

  const parsed = updateHypothesisSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_by: user.id }
  if (parsed.data.statement !== undefined) updates.statement = parsed.data.statement.trim()
  if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.evidenceSummary !== undefined) updates.evidence_summary = parsed.data.evidenceSummary

  const { data, error } = await supabase
    .from("alert_case_hypotheses")
    .update(updates)
    .eq("case_id", id)
    .eq("id", hypothesisId)
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Hypothesis not found" }, { status: 404 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "hypothesis_updated",
    details: { hypothesisId, ...parsed.data },
    created_by: user.id,
  })

  return NextResponse.json({
    hypothesis: {
      id: data.id,
      statement: data.statement,
      confidence: data.confidence,
      status: data.status,
      evidenceSummary: data.evidence_summary,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      updatedBy: data.updated_by,
    },
  })
}

