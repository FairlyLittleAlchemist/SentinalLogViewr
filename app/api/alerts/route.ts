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
    .from("alerts")
    .select("*")
    .order("timestamp", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alerts = (data ?? []).map((alert) => ({
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    source: alert.source,
    timestamp: alert.timestamp,
    description: alert.description,
    assignee: alert.assignee,
    tactics: alert.tactics,
    affectedEntities: alert.affected_entities,
    recommendedActions: alert.recommended_actions,
  }))

  return NextResponse.json({ alerts })
}
