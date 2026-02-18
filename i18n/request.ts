import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { defaultLocale, isAppLocale } from "@/i18n/locales"

function detectFromAcceptLanguage(headerValue: string | null): string {
  if (!headerValue) return defaultLocale
  const token = headerValue
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .find(Boolean)
  if (!token) return defaultLocale
  if (token.startsWith("fr")) return "fr"
  return "en"
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value
  const headerStore = await headers()
  const acceptLanguage = headerStore.get("accept-language")

  const locale = isAppLocale(localeCookie)
    ? localeCookie
    : detectFromAcceptLanguage(acceptLanguage)

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
