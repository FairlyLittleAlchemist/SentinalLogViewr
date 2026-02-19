import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { defaultRole, type Role } from "@/lib/auth/roles"

const publicPaths = ["/auth", "/unauthorized"]
const SUPABASE_HEALTH_TTL_MS = 5_000
let lastSupabaseHealthCheckAt = 0
let lastSupabaseHealth = true

const roleRoutes: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/alerts", roles: ["admin", "analyst", "viewer"] },
  { prefix: "/recommendations", roles: ["admin", "analyst", "viewer"] },
  { prefix: "/chatbot", roles: ["admin", "analyst", "viewer"] },
  { prefix: "/logs", roles: ["admin", "analyst", "viewer"] },
  { prefix: "/account", roles: ["admin", "analyst", "viewer"] },
  { prefix: "/", roles: ["admin", "analyst", "viewer"] },
]

function getRequiredRoles(pathname: string) {
  if (pathname.startsWith("/api/chat")) {
    return ["admin", "analyst", "viewer"] as Role[]
  }

  if (pathname.startsWith("/api")) {
    return ["admin", "analyst", "viewer"] as Role[]
  }

  const matched = roleRoutes.find((route) => pathname.startsWith(route.prefix))
  return matched?.roles ?? null
}

async function isSupabaseReachable(supabaseUrl: string) {
  const now = Date.now()
  if (now - lastSupabaseHealthCheckAt < SUPABASE_HEALTH_TTL_MS) {
    return lastSupabaseHealth
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    lastSupabaseHealth = response.ok
  } catch {
    lastSupabaseHealth = false
  } finally {
    clearTimeout(timeout)
    lastSupabaseHealthCheckAt = now
  }

  return lastSupabaseHealth
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public") ||
    publicPaths.some((path) => pathname.startsWith(path))
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const isReachable = await isSupabaseReachable(supabaseUrl)
  if (!isReachable) {
    if (pathname.startsWith("/auth")) {
      return response
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth"
    redirectUrl.searchParams.set("next", pathname)
    redirectUrl.searchParams.set("error", "auth_service_unavailable")
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth"
    redirectUrl.searchParams.set("next", pathname)
    redirectUrl.searchParams.set("error", "auth_service_unavailable")
    return NextResponse.redirect(redirectUrl)
  }

  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth"
    redirectUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  const requiredRoles = getRequiredRoles(pathname)
  if (!requiredRoles) {
    return response
  }

  let profile = null
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    profile = data
  } catch {
    return response
  }

  const role = (profile?.role as Role | undefined) ?? defaultRole
  if (!requiredRoles.includes(role)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/unauthorized"
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
