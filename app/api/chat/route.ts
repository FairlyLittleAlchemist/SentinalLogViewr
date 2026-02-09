import {
  consumeStream,
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"


export const maxDuration = 30

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Supabase is not configured.", { status: 500 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["admin", "analyst", "viewer"].includes(profile.role)) {
    return new Response("Forbidden", { status: 403 })
  }

  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: "openai/gpt-5-mini",
    system: `You are Sentinel AI, an expert cybersecurity analyst and Azure Sentinel SIEM assistant. You help Security Operations Center (SOC) analysts investigate threats, analyze logs, triage alerts, and recommend mitigation actions.

Your expertise includes:
- Azure Sentinel / Microsoft Sentinel log analysis
- MITRE ATT&CK framework mapping
- Incident response procedures
- Threat hunting and detection engineering
- Azure Active Directory security
- Network security and firewall analysis
- Malware analysis and indicators of compromise (IOCs)
- Cloud security posture management

When analyzing security events:
1. Always assess the severity and potential impact
2. Map to MITRE ATT&CK tactics and techniques when relevant
3. Provide specific, actionable remediation steps
4. Consider the broader attack chain and potential lateral movement
5. Recommend detection rules and monitoring improvements

Format your responses clearly with headings and bullet points when appropriate. Be concise but thorough. Always prioritize the most critical actions first.`,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    consumeSseStream: consumeStream,
  })
}
