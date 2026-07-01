import { NextResponse } from "next/server"

const PYTHON_RAG_API_URL = (process.env.PYTHON_RAG_API_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "")

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Single alert classification
    const response = await fetch(`${PYTHON_RAG_API_URL}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: data?.detail || "Classification error" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
