import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const createHypothesisSchema = z.object({
  statement: z.string().min(4).max(2000),
  confidence: z.number().int().min(0).max(100).optional().default(50),
  status: z.enum(["open", "confirmed", "rejected"]).optional().default("open"),
  evidenceSummary: z.string().max(4000).optional().nullable(),
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

  const parsed = createHypothesisSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hypothesis payload" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("alert_case_hypotheses")
    .insert({
      case_id: id,
      statement: parsed.data.statement.trim(),
      confidence: parsed.data.confidence,
      status: parsed.data.status,
      evidence_summary: parsed.data.evidenceSummary ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create hypothesis" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "hypothesis_added",
    details: { hypothesisId: data.id, status: data.status },
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

