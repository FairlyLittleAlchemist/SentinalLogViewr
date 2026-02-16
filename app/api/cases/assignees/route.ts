import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .in("role", ["admin", "analyst"])
    .order("full_name", { ascending: true })

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const { data: openCases, error: openCasesError } = await supabase
    .from("alert_cases")
    .select("assignee_user_id,status")
    .in("status", ["open", "in_progress"])

  if (openCasesError) {
    return NextResponse.json({ error: openCasesError.message }, { status: 500 })
  }

  const workloadByUser = new Map<string, number>()
  for (const item of openCases ?? []) {
    const key = String(item.assignee_user_id ?? "").trim()
    if (!key) continue
    workloadByUser.set(key, (workloadByUser.get(key) ?? 0) + 1)
  }

  const assignees = (profiles ?? []).map((entry) => ({
    id: entry.id,
    name: entry.full_name || entry.email,
    email: entry.email,
    role: entry.role,
    openCases: workloadByUser.get(entry.id) ?? 0,
  }))

  return NextResponse.json({ assignees })
}
