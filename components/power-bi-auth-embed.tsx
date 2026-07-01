"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { getMsalInstance, PBI_SCOPES, PBI_EMBED_URL, REPORT_ID } from "@/lib/msal-config"

type Status = "idle" | "signing-in" | "loading" | "loaded" | "error"

export function PowerBIAuthEmbed() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [userName, setUserName] = useState("")

  const embedReport = useCallback(async (accessToken: string) => {
    if (!containerRef.current) return
    setStatus("loading")

    try {
      const pbi = await import("powerbi-client")
      const models = pbi.models

      const powerbi = new pbi.service.Service(
        pbi.factories.hpmFactory,
        pbi.factories.wpmpFactory,
        pbi.factories.routerFactory
      )

      powerbi.reset(containerRef.current)

      const report = powerbi.embed(containerRef.current, {
        type: "report",
        tokenType: models.TokenType.Aad,
        accessToken,
        embedUrl: PBI_EMBED_URL,
        id: REPORT_ID,
        permissions: models.Permissions.All,
        settings: {
          panes: {
            filters: { visible: true },
            pageNavigation: { visible: true },
          },
          bars: { statusBar: { visible: true } },
        },
      })

      report.off("loaded")
      report.on("loaded", () => {
        setStatus("loaded")
        report.off("loaded")
      })

      report.off("rendered")
      report.on("rendered", () => {
        setStatus("loaded")
        report.off("rendered")
      })

      report.off("error")
      report.on("error", (event: any) => {
        const msg = event?.detail?.message || "Erreur Power BI"
        console.error("PBI error:", msg)
        setStatus("error")
        setErrorMsg(msg)
      })
    } catch (e: any) {
      setStatus("error")
      setErrorMsg(e.message)
    }
  }, [])

  const signIn = useCallback(async () => {
    setStatus("signing-in")
    setErrorMsg("")
    try {
      const msal = getMsalInstance()
      await msal.initialize()

      let result = null

      // Try silent first (user may already be logged in)
      const accounts = msal.getAllAccounts()
      if (accounts.length > 0) {
        try {
          result = await msal.acquireTokenSilent({
            scopes: PBI_SCOPES,
            account: accounts[0],
          })
          setUserName(accounts[0].name || accounts[0].username)
        } catch {
          result = null
        }
      }

      // Popup login if silent failed
      if (!result) {
        result = await msal.acquireTokenPopup({ scopes: PBI_SCOPES })
        setUserName(result.account?.name || result.account?.username || "")
      }

      await embedReport(result.accessToken)
    } catch (e: any) {
      setStatus("error")
      if (e.errorCode === "user_cancelled") {
        setErrorMsg("Connexion annulée.")
      } else {
        setErrorMsg(e.message || "Erreur de connexion Microsoft")
      }
    }
  }, [embedReport])

  // Auto sign-in on mount if already authenticated
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID
    if (!clientId) return
    signIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID

  // No client ID configured
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-[#F2C811]/10 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="18" rx="2" fill="#F2C811" opacity="0.2"/>
            <path d="M7 17V10M10.5 17V7M14 17V12M17.5 17V9" stroke="#F2C811" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="space-y-3 max-w-md">
          <h2 className="text-lg font-semibold">Une étape rapide</h2>
          <p className="text-sm text-muted-foreground">
            Pour afficher le rapport Power BI automatiquement, tu as besoin d'un <strong>Client ID Azure</strong>.
          </p>
          <div className="text-left bg-muted rounded-lg p-4 text-xs space-y-2">
            <p className="font-semibold text-foreground">Comment l'obtenir (2 min) :</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Va sur <strong>portal.azure.com</strong> (connecte-toi avec ton compte Microsoft)</li>
              <li>Recherche <strong>"Inscriptions d'applications"</strong></li>
              <li>Clique <strong>"Nouvelle inscription"</strong></li>
              <li>Nom : <code className="bg-background px-1 rounded">SentinelSOC</code></li>
              <li>Type de compte : <strong>"Comptes Microsoft personnels"</strong></li>
              <li>URI de redirection : <code className="bg-background px-1 rounded">http://localhost:3000</code></li>
              <li>Copie le <strong>ID d'application (client)</strong></li>
            </ol>
          </div>
          <div className="text-left bg-muted rounded-lg p-3 text-xs font-mono">
            <p className="text-muted-foreground"># Dans .env.local :</p>
            <p>NEXT_PUBLIC_AZURE_CLIENT_ID=<span className="text-yellow-400">colle-ici-le-client-id</span></p>
          </div>
        </div>
        <a
          href="https://app.powerbi.com/groups/me/reports/92af073f-8f76-49d7-8957-2589f22f0032"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F2C811] text-black font-semibold text-sm hover:bg-[#F2C811]/90 transition-colors"
        >
          Ouvrir Power BI en attendant →
        </a>
      </div>
    )
  }

  // Idle / sign-in button
  if (status === "idle" || status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-[#F2C811]/10 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="18" rx="2" fill="#F2C811" opacity="0.2"/>
            <path d="M7 17V10M10.5 17V7M14 17V12M17.5 17V9" stroke="#F2C811" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Dashboard Power BI</h2>
          {errorMsg && (
            <p className="text-sm text-red-400">{errorMsg}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Connecte-toi avec ton compte Microsoft pour afficher le rapport.
          </p>
        </div>
        <button
          onClick={signIn}
          className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-[#0078D4] text-white font-semibold text-sm hover:bg-[#106EBE] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Se connecter avec Microsoft
        </button>
      </div>
    )
  }

  // Loading / signing-in spinner
  if (status === "signing-in" || status === "loading") {
    return (
      <div className="relative w-full h-full">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-10">
          <div className="w-8 h-8 border-2 border-[#F2C811] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            {status === "signing-in" ? "Connexion Microsoft…" : "Chargement du rapport…"}
          </p>
          {userName && (
            <p className="text-xs text-muted-foreground">Connecté en tant que {userName}</p>
          )}
        </div>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    )
  }

  // Loaded
  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
