"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserRoleTable } from "@/components/admin/user-role-table"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { EXPERIMENTAL_PLAYBOOKS_FLAG } from "@/lib/feature-flags"
import { useTranslations } from "next-intl"

export default function AdminDashboardPage() {
  const t = useTranslations("pages")
  const [playbooksEnabled, setPlaybooksEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const loadFlags = async () => {
      const res = await fetch("/api/feature-flags", { cache: "no-store" }).catch(() => null)
      if (!active || !res?.ok) return
      const payload = await res.json() as { flags?: Array<{ key: string; enabled: boolean }> }
      const enabled = Boolean(payload.flags?.some((flag) => flag.key === EXPERIMENTAL_PLAYBOOKS_FLAG && flag.enabled))
      setPlaybooksEnabled(enabled)
    }
    void loadFlags()
    return () => { active = false }
  }, [])

  const onTogglePlaybooks = async (enabled: boolean) => {
    setBusy(true)
    const res = await fetch("/api/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: EXPERIMENTAL_PLAYBOOKS_FLAG, enabled }),
    }).catch(() => null)
    if (res?.ok) {
      setPlaybooksEnabled(enabled)
    }
    setBusy(false)
  }

  return (
    <DashboardLayout>
      <AppHeader title={t("admin")} />
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Access Control</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Manage user roles and access levels for Sentinel Command. Admins can update roles for any user.
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Experimental Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3 rounded border border-border p-3">
              <div className="space-y-1">
                <Label htmlFor="toggle-playbooks" className="text-xs font-medium text-foreground">Playbooks module</Label>
                <p>Enable the Playbooks tab, template editor, and case execution controls.</p>
              </div>
              <Switch
                id="toggle-playbooks"
                checked={playbooksEnabled}
                disabled={busy}
                onCheckedChange={(checked) => { void onTogglePlaybooks(checked) }}
              />
            </div>
          </CardContent>
        </Card>

        <UserRoleTable title="Role Management" />
      </div>
    </DashboardLayout>
  )
}
