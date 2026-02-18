"use client"

import { useTransition } from "react"
import { Languages } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations("language")
  const [isPending, startTransition] = useTransition()

  const setLocale = (nextLocale: "en" | "fr") => {
    if (nextLocale === locale) return
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      })
      window.location.reload()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground" disabled={isPending}>
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setLocale("en")}>{t("english")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("fr")}>{t("french")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
