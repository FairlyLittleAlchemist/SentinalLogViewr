import { NextResponse } from "next/server"
import { z } from "zod"
import { defaultLocale, isAppLocale } from "@/i18n/locales"

const schema = z.object({
  locale: z.string().min(2).max(5),
})

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale payload" }, { status: 400 })
  }

  const locale = isAppLocale(parsed.data.locale) ? parsed.data.locale : defaultLocale
  const response = NextResponse.json({ locale })
  response.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  return response
}
