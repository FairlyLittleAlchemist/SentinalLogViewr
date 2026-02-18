import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const createEvidenceSchema = z.object({
  label: z.string().min(2).max(180),
  evidenceType: z.enum(["link", "file", "hash", "ioc", "note"]).optional().default("link"),
  url: z.string().url().optional().nullable(),
  details: z.string().max(5000).optional().nullable(),
  filePath: z.string().max(500).optional().nullable(),
  fileSizeBytes: z.number().int().positive().optional().nullable(),
  contentType: z.string().max(120).optional().nullable(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional().nullable(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await hasPermission(supabase, user, role, "cases.update"))) {
    return NextResponse.json({ error: "Forbidden", requiredPermission: "cases.update" }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = createEvidenceSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid evidence payload" }, { status: 400 })
  }

  const { data: evidence, error } = await supabase
    .from("alert_case_evidence")
    .insert({
      case_id: id,
      label: parsed.data.label.trim(),
      evidence_type: parsed.data.evidenceType,
      url: parsed.data.url ?? null,
      details: parsed.data.details ?? null,
      file_path: parsed.data.filePath ?? null,
      file_size_bytes: parsed.data.fileSizeBytes ?? null,
      content_type: parsed.data.contentType ?? null,
      sha256: parsed.data.sha256 ? parsed.data.sha256.toLowerCase() : null,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error || !evidence) {
    return NextResponse.json({ error: error?.message ?? "Failed to add evidence" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "evidence_added",
    details: {
      evidenceId: evidence.id,
      evidenceType: evidence.evidence_type,
      label: evidence.label,
    },
    created_by: user.id,
  })

  return NextResponse.json({
    evidence: {
      id: evidence.id,
      label: evidence.label,
      evidenceType: evidence.evidence_type,
      url: evidence.url,
      details: evidence.details,
      filePath: evidence.file_path,
      fileSizeBytes: evidence.file_size_bytes,
      contentType: evidence.content_type,
      sha256: evidence.sha256,
      createdAt: evidence.created_at,
      createdBy: evidence.created_by,
    },
  })
}
