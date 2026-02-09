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

  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .order("timestamp", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs = (data ?? []).map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    severity: log.severity,
    source: log.source,
    category: log.category,
    message: log.message,
    ipAddress: log.ip_address,
    user: log.user,
    status: log.status,
  }))

  return NextResponse.json({ logs })
}
