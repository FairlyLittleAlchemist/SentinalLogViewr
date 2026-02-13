import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100)

  const { data, error } = await supabase.from("logs").select("source")
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const source = (row.source ?? "").trim()
    if (!source) continue
    counts.set(source, (counts.get(source) ?? 0) + 1)
  }

  const sources = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([source, count]) => ({ source, count }))

  return NextResponse.json({ sources })
}
