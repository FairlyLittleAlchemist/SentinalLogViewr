import type { User } from "@supabase/supabase-js"
import type { createClient } from "@/lib/supabase/server"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

export async function getCurrentUserAndRole(supabase: ServerSupabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: null as string | null }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  return {
    user,
    role: String(profile?.role ?? "").toLowerCase() || null,
  }
}

export function isAdmin(user: User | null, role: string | null) {
  return Boolean(user && role === "admin")
}

export function isAdminOrAnalyst(user: User | null, role: string | null) {
  return Boolean(user && (role === "admin" || role === "analyst"))
}

function fallbackRolePermission(role: string | null, permission: string) {
  if (!role) return false
  if (role === "admin") return true

  const analystPermissions = new Set([
    "dashboard.read",
    "alerts.read",
    "alerts.update",
    "logs.read",
    "recommendations.read",
    "cases.read",
    "cases.create",
    "cases.update",
    "cases.assign",
    "cases.close",
    "cases.link_alerts",
    "cases.link_logs",
    "cases.manage_playbook",
    "boards.read",
    "boards.create_case",
    "boards.create_personal",
    "boards.edit",
    "boards.delete",
    "playbooks.read",
  ])

  const viewerPermissions = new Set([
    "dashboard.read",
    "alerts.read",
    "logs.read",
    "recommendations.read",
    "cases.read",
    "boards.read",
    "playbooks.read",
  ])

  if (role === "analyst") return analystPermissions.has(permission)
  if (role === "viewer") return viewerPermissions.has(permission)
  return false
}

function isMissingFunctionError(error: { message?: string } | null) {
  const message = String(error?.message ?? "").toLowerCase()
  return message.includes("could not find the function") || message.includes("no function matches")
}

export async function hasPermission(
  supabase: ServerSupabase,
  user: User | null,
  role: string | null,
  permission: string
) {
  if (!user) return false

  const { data, error } = await supabase.rpc("has_permission", { p_permission: permission })
  if (!error) {
    return Boolean(data)
  }
  if (isMissingFunctionError(error)) {
    return fallbackRolePermission(role, permission)
  }
  return false
}

export async function currentPermissions(
  supabase: ServerSupabase,
  user: User | null,
  role: string | null
) {
  if (!user) return [] as string[]

  const { data, error } = await supabase.rpc("current_permissions")
  if (!error) {
    return (data ?? [])
      .map((row: unknown) => String((row as { permission_key?: string }).permission_key ?? ""))
      .filter(Boolean)
  }
  if (isMissingFunctionError(error)) {
    return [
      "dashboard.read",
      "alerts.read",
      "alerts.update",
      "logs.read",
      "recommendations.read",
      "cases.read",
      "cases.create",
      "cases.update",
      "cases.assign",
      "cases.close",
      "cases.link_alerts",
      "cases.link_logs",
      "cases.manage_playbook",
      "boards.read",
      "boards.create_case",
      "boards.create_personal",
      "boards.edit",
      "boards.delete",
      "playbooks.read",
      "playbooks.edit",
      "playbooks.approve",
      "admin.users.manage",
      "admin.flags.manage",
    ].filter((permission) => fallbackRolePermission(role, permission))
  }
  return [] as string[]
}
