import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Bell,
  ScrollText,
  ShieldAlert,
  Bot,
  Users,
} from "lucide-react"
import type { Role } from "@/lib/auth/roles"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
  roles: Role[]
}

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: Bell,
    badge: 23,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Log Viewer",
    href: "/logs",
    icon: ScrollText,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Recommendations",
    href: "/recommendations",
    icon: ShieldAlert,
    badge: 5,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "AI Assistant",
    href: "/chatbot",
    icon: Bot,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Admin Dashboard",
    href: "/admin",
    icon: Users,
    roles: ["admin"],
  },
]
