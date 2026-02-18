import { NextResponse } from "next/server"
import { createHash, randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserAndRole, hasPermission } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

const BUCKET = "case-evidence"
const MAX_BYTES = 50 * 1024 * 1024

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "evidence.bin"
}

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

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: "Invalid multipart form-data payload" }, { status: 400 })
  }

  const file = formData.get("file")
  const labelInput = String(formData.get("label") ?? "").trim()
  const detailsInput = String(formData.get("details") ?? "").trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File size is invalid or exceeds 50MB limit" }, { status: 400 })
  }

  const fileName = sanitizeFileName(file.name)
  const filePath = `${id}/${Date.now()}-${randomUUID().slice(0, 8)}-${fileName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash("sha256").update(buffer).digest("hex")

  const { error: uploadError } = await supabase
    .storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = supabase
    .storage
    .from(BUCKET)
    .getPublicUrl(filePath)

  const label = labelInput || fileName
  const publicUrl = publicUrlData.publicUrl

  const { data: evidence, error: evidenceError } = await supabase
    .from("alert_case_evidence")
    .insert({
      case_id: id,
      label,
      evidence_type: "file",
      url: publicUrl,
      details: detailsInput || null,
      file_path: filePath,
      file_size_bytes: file.size,
      content_type: file.type || "application/octet-stream",
      sha256,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (evidenceError || !evidence) {
    return NextResponse.json({ error: evidenceError?.message ?? "Failed to add evidence record" }, { status: 500 })
  }

  await supabase.from("alert_case_activity").insert({
    case_id: id,
    action: "evidence_file_uploaded",
    details: {
      evidenceId: evidence.id,
      label: evidence.label,
      filePath,
      fileSizeBytes: file.size,
      contentType: evidence.content_type,
      sha256,
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
