import type { Role } from "@/lib/auth/roles"

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
  created_at?: string
  updated_at?: string
}
