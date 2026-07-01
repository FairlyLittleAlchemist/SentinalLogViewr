import React from "react"
import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import { getLocale, getMessages } from "next-intl/server"
import { NextIntlClientProvider } from "next-intl"

import './globals.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { ThemeProvider } from '@/components/theme-provider'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], variable: '--font-dm-mono', weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'Sentinel Command - Azure Sentinel Log Management',
  description: 'Security Operations Center dashboard for Azure Sentinel log management, threat detection, and incident response.',
}

export const viewport: Viewport = {
  themeColor: '#f3f4ed',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const localePromise = getLocale()
  const messagesPromise = getMessages()

  return (
    <LayoutWithIntl localePromise={localePromise} messagesPromise={messagesPromise}>
      {children}
    </LayoutWithIntl>
  )
}

async function LayoutWithIntl({
  children,
  localePromise,
  messagesPromise,
}: {
  children: React.ReactNode
  localePromise: ReturnType<typeof getLocale>
  messagesPromise: ReturnType<typeof getMessages>
}) {
  const [locale, messages] = await Promise.all([localePromise, messagesPromise])

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${dmSans.variable} ${dmMono.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="theme-emerald"
            enableSystem={false}
            themes={["theme-emerald", "theme-forest", "theme-sand", "theme-ocean", "theme-amber", "dark"]}
          >
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
