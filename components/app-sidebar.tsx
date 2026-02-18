"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, LogOut, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { navItems, playbooksNavItem } from "@/lib/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { EXPERIMENTAL_PLAYBOOKS_FLAG } from "@/lib/feature-flags"
import { useTranslations } from "next-intl"

export function AppSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [playbooksEnabled, setPlaybooksEnabled] = useState(false)
  const { user, profile, role, loading, signOut } = useAuth()
  const t = useTranslations()

  useEffect(() => {
    let active = true
    const loadFlags = async () => {
      const res = await fetch("/api/feature-flags", { cache: "no-store" }).catch(() => null)
      if (!active || !res?.ok) return
      const payload = await res.json().catch(() => null) as { flags?: Array<{ key: string; enabled: boolean }> } | null
      const enabled = Boolean(payload?.flags?.some((flag) => flag.key === EXPERIMENTAL_PLAYBOOKS_FLAG && flag.enabled))
      setPlaybooksEnabled(enabled)
    }
    void loadFlags()
    return () => { active = false }
  }, [])

  const visibleNavItems = useMemo(() => {
    const items = navItems.slice()
    if (playbooksEnabled) {
      items.splice(5, 0, playbooksNavItem)
    }
    return items.filter((item) => item.roles.includes(role))
  }, [playbooksEnabled, role])
  const displayName = profile?.full_name || user?.email || "User"
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border/80 bg-[linear-gradient(180deg,hsl(var(--sidebar-background))/0.98,hsla(156,42%,10%,0.98))] text-sidebar-foreground backdrop-blur-sm transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center gap-3 border-b border-sidebar-border/70 px-4 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Shield className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{t("app.name")}</span>
            <span className="text-xs text-muted-foreground">{t("app.subtitle")}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-4">
        {!collapsed && (
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t("common.navigation")}
          </div>
        )}
        <div className="space-y-1.5">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "interactive-surface flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-200 ease-out",
                  isActive
                    ? "border-primary/25 bg-primary/14 text-primary shadow-[inset_0_1px_0_hsl(var(--primary)/0.3)]"
                    : "border-transparent text-muted-foreground hover:border-sidebar-border/60 hover:bg-secondary/45 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{t(`nav.${item.labelKey}`)}</span>
                    {item.badge && (
                      <Badge
                        className={cn(
                          "h-5 min-w-5 justify-center px-1.5 text-[10px]",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-destructive text-destructive-foreground"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="mt-auto border-t border-sidebar-border/70 px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center rounded-lg text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <div className="border-t border-sidebar-border/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {loading ? "..." : initials || "SC"}
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-xs font-medium text-foreground">{displayName}</span>
              <span className="truncate text-[10px] text-muted-foreground">{user?.email ?? "-"}</span>
              <span className="text-[10px] text-muted-foreground">{t(`roles.${role}`)}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start text-xs text-muted-foreground hover:bg-secondary/45 hover:text-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {t("common.signOut")}
          </Button>
        </div>
      )}
    </aside>
  )
}
