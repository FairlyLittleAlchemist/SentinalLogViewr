import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Bell,
  ScrollText,
  ShieldAlert,
  Bot,
  Briefcase,
  Network,
  Users,
  ClipboardList,
} from "lucide-react"
import type { Role } from "@/lib/auth/roles"

export interface NavItem {
  label: string
  labelKey: string
  href: string
  icon: LucideIcon
  badge?: number
  roles: Role[]
}

export const playbooksNavItem: NavItem = {
  label: "Playbooks",
  labelKey: "playbooks",
  href: "/playbooks",
  icon: ClipboardList,
  roles: ["admin", "analyst", "viewer"],
}

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    labelKey: "dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Alerts",
    labelKey: "alerts",
    href: "/alerts",
    icon: Bell,
    badge: 23,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Log Viewer",
    labelKey: "logs",
    href: "/logs",
    icon: ScrollText,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Recommendations",
    labelKey: "recommendations",
    href: "/recommendations",
    icon: ShieldAlert,
    badge: 5,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Cases",
    labelKey: "cases",
    href: "/cases",
    icon: Briefcase,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Board",
    labelKey: "board",
    href: "/board",
    icon: Network,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "AI Assistant",
    labelKey: "aiAssistant",
    href: "/chatbot",
    icon: Bot,
    roles: ["admin", "analyst", "viewer"],
  },
  {
    label: "Admin Dashboard",
    labelKey: "admin",
    href: "/admin",
    icon: Users,
    roles: ["admin"],
  },
]
