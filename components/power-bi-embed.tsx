"use client"

import { useEffect, useRef, useState } from "react"

interface PowerBIEmbedProps {
  embedUrl: string
  accessToken: string
  reportId: string
  tokenType?: number // 0 = AAD, 1 = Embed
}

export function PowerBIEmbed({
  embedUrl,
  accessToken,
  reportId,
  tokenType = 0,
}: PowerBIEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "loaded" | "rendered" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (!embedUrl || !accessToken || !reportId) {
      setStatus("error")
      setErrorMsg("Configuration manquante (URL, token ou ID rapport).")
      return
    }

    let report: any

    const load = async () => {
      const pbi = await import("powerbi-client")
      const models = pbi.models

      const config = {
        type: "report",
        tokenType: tokenType === 0 ? models.TokenType.Aad : models.TokenType.Embed,
        accessToken,
        embedUrl,
        id: reportId,
        permissions: models.Permissions.All,
        settings: {
          panes: {
            filters: { visible: true },
            pageNavigation: { visible: true },
          },
          bars: {
            statusBar: { visible: true },
          },
        },
      }

      const powerbi = new pbi.service.Service(
        pbi.factories.hpmFactory,
        pbi.factories.wpmpFactory,
        pbi.factories.routerFactory
      )

      if (!containerRef.current) return

      report = powerbi.embed(containerRef.current, config)

      report.off("loaded")
      report.on("loaded", () => {
        setStatus("loaded")
        report.off("loaded")
      })

      report.off("rendered")
      report.on("rendered", () => {
        setStatus("rendered")
        report.off("rendered")
      })

      report.off("error")
      report.on("error", (event: any) => {
        console.error("Power BI error:", event.detail)
        setStatus("error")
        setErrorMsg(event.detail?.message || "Erreur inconnue Power BI")
      })
    }

    load().catch((e) => {
      setStatus("error")
      setErrorMsg(e.message)
    })

    return () => {
      try {
        const pbi = require("powerbi-client")
        const powerbi = new pbi.service.Service(
          pbi.factories.hpmFactory,
          pbi.factories.wpmpFactory,
          pbi.factories.routerFactory
        )
        if (containerRef.current) powerbi.reset(containerRef.current)
      } catch {}
    }
  }, [embedUrl, accessToken, reportId, tokenType])

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#F2C811] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement du rapport…</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
