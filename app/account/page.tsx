"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import { roleLabels } from "@/lib/auth/roles"

export default function AccountPage() {
  const supabase = useMemo(() => createClient(), [])
  const { user, profile, role, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setFullName(profile?.full_name ?? "")
  }, [profile?.full_name])

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) {
      return
    }

    setSavingProfile(true)
    setProfileError(null)
    setProfileMessage(null)

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id)

    setSavingProfile(false)

    if (error) {
      setProfileError(error.message)
      return
    }

    await refreshProfile()
    setProfileMessage("Profile updated.")
  }

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordMessage(null)

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.")
      return
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.")
      return
    }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSavingPassword(false)

    if (error) {
      setPasswordError(error.message)
      return
    }

    setPassword("")
    setConfirmPassword("")
    setPasswordMessage("Password updated.")
  }

  return (
    <DashboardLayout>
      <AppHeader title="Account Settings" />
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileMessage && (
              <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                {profileMessage}
              </div>
            )}
            {profileError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {profileError}
              </div>
            )}
            <form className="space-y-3" onSubmit={handleProfileSave}>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  value={user?.email ?? ""}
                  disabled
                  className="bg-secondary text-muted-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Full name</label>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="bg-secondary"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Role</span>
                <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px]">
                  {roleLabels[role]}
                </Badge>
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordMessage && (
              <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                {passwordMessage}
              </div>
            )}
            {passwordError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {passwordError}
              </div>
            )}
            <form className="space-y-3" onSubmit={handlePasswordSave}>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">New password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Confirm password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="bg-secondary"
                />
              </div>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
