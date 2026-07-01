import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const GRADE_API = (process.env.SENTINEL_ML_API_URL?.trim() || "http://127.0.0.1:8005").replace(/\/+$/, "")

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const response = await fetch(`${GRADE_API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: data?.detail || "XGBoost API error" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Service indisponible" },
      { status: 500 }
    )
  }
}
