export const roles = ["admin", "analyst", "viewer"] as const
export type Role = typeof roles[number]

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
}

export const defaultRole: Role = "viewer"

export function isRoleAllowed(role: Role, allowed: Role[]) {
  return allowed.includes(role)
}
