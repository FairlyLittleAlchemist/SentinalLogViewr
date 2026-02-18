import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { currentPermissions, getCurrentUserAndRole } from "@/lib/auth/server-role"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { user, role } = await getCurrentUserAndRole(supabase)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const permissions = await currentPermissions(supabase, user, role)
  return NextResponse.json({ role, permissions })
}
