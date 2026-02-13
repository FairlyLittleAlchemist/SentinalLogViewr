"use client"

import { Check, Moon, Palette, Trees, Waves } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const themeOptions = [
  { value: "theme-emerald", label: "Emerald", icon: Palette },
  { value: "theme-forest", label: "Forest", icon: Trees },
  { value: "theme-sand", label: "Sand", icon: Waves },
  { value: "dark", label: "Dark", icon: Moon },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Change theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-card text-foreground border-border">
        {themeOptions.map((option) => {
          const Icon = option.icon
          const active = theme === option.value
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              className="flex items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </span>
              <Check className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
