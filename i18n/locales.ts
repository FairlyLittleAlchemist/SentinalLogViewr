export const locales = ["en", "fr"] as const

export type AppLocale = (typeof locales)[number]

export const defaultLocale: AppLocale = "en"

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return Boolean(value && locales.includes(value as AppLocale))
}
