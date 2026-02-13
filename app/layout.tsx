import React from "react"
import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'

import './globals.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { ThemeProvider } from '@/components/theme-provider'

const _dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const _dmMono = DM_Mono({ subsets: ['latin'], variable: '--font-dm-mono', weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'Sentinel Command - Azure Sentinel Log Management',
  description: 'Security Operations Center dashboard for Azure Sentinel log management, threat detection, and incident response.',
}

export const viewport: Viewport = {
  themeColor: '#eef5f0',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${_dmSans.variable} ${_dmMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="theme-emerald"
          enableSystem={false}
          themes={["theme-emerald", "theme-forest", "theme-sand", "dark"]}
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
