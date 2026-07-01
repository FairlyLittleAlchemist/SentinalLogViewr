import { PublicClientApplication, Configuration, LogLevel } from "@azure/msal-browser"

const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || ""

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: "https://login.microsoftonline.com/consumers",
    redirectUri: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: () => {},
      logLevel: LogLevel.Error,
    },
  },
}

export const PBI_SCOPES = ["https://analysis.windows.net/powerbi/api/Report.Read.All"]

export const REPORT_ID = "92af073f-8f76-49d7-8957-2589f22f0032"

export const PBI_EMBED_URL = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=me`

let _msalInstance: PublicClientApplication | null = null

export function getMsalInstance(): PublicClientApplication {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(msalConfig)
  }
  return _msalInstance
}
