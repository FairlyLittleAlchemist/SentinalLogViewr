import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { defaultRole, type Role } from "@/lib/auth/roles"

const publicPaths = ["/auth", "/unauthorized"]

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public") ||
    publicPaths.some((path) => pathname.startsWith(path))
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return response
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

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
