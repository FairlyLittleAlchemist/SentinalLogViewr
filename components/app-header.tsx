"use client"

import { Bell, Search, Menu, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Shield } from "lucide-react"
import { navItems } from "@/lib/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { roleLabels } from "@/lib/auth/roles"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeSwitcher } from "@/components/theme-switcher"

export function AppHeader({ title }: { title: string }) {
  const pathname = usePathname()
  const { user, profile, role, loading, signOut } = useAuth()

  const visibleNavItems = navItems.filter((item) => item.roles.includes(role))
  const displayName = profile?.full_name || user?.email || "User"
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-card/85 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover-glow lg:hidden text-muted-foreground">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <SheetHeader className="border-b border-border px-4 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Shield className="h-4 w-4 text-primary-foreground" />
                </div>
                <SheetTitle className="text-sm font-semibold text-foreground">Sentinel Command</SheetTitle>
              </div>
            </SheetHeader>
            <nav className="space-y-1 px-2 py-4">
              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <Badge className="h-5 min-w-5 justify-center bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
        <h1 className="animate-fade-in text-sm font-semibold text-foreground lg:text-base">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs, alerts..."
            className="h-8 w-64 bg-secondary pl-8 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus-visible:ring-primary/40"
          />
        </div>
        <ThemeSwitcher />
        <Button variant="ghost" size="icon" className="hover-glow relative text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            3
          </span>
          <span className="sr-only">Notifications</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hover-glow text-muted-foreground">
              {loading ? (
                <UserCircle className="h-5 w-5" />
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px] font-semibold">
                    {initials || "SC"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="sr-only">Open user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-card text-foreground border-border">
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-xs font-semibold">{displayName}</span>
              <span className="text-[10px] text-muted-foreground">{roleLabels[role]}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account">Account settings</Link>
            </DropdownMenuItem>
            {role === "admin" && (
              <DropdownMenuItem asChild>
                <Link href="/admin">Admin dashboard</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                void signOut()
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
