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
    .from("recommendations")
    .select("*")
    .order("priority", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const recommendations = (data ?? []).map((rec) => ({
    id: rec.id,
    title: rec.title,
    priority: rec.priority,
    category: rec.category,
    description: rec.description,
    impact: rec.impact,
    effort: rec.effort,
    status: rec.status,
    relatedAlerts: rec.related_alerts,
  }))

  return NextResponse.json({ recommendations })
}
