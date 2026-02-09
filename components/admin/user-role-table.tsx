"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { roles, roleLabels, type Role } from "@/lib/auth/roles"
import type { Profile } from "@/lib/auth/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface UserRoleTableProps {
  title?: string
}

export function UserRoleTable({ title = "Role Management" }: UserRoleTableProps) {
  const supabase = useMemo(() => createClient(), [])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadProfiles = async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setProfiles((data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleRoleChange = async (profileId: string, nextRole: Role) => {
    setUpdatingId(profileId)
    setError(null)

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", profileId)

    if (updateError) {
      setError(updateError.message)
    } else {
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === profileId ? { ...profile, role: nextRole } : profile
        )
      )
    }

    setUpdatingId(null)
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="border-b border-border px-4 py-3 text-xs text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground">Loading users...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs text-muted-foreground">Name</TableHead>
                <TableHead className="text-xs text-muted-foreground">Email</TableHead>
                <TableHead className="text-xs text-muted-foreground">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id} className="border-border">
                  <TableCell className="text-xs text-foreground">
                    {profile.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {profile.email || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    <Select
                      value={profile.role}
                      onValueChange={(value) => handleRoleChange(profile.id, value as Role)}
                      disabled={updatingId === profile.id}
                    >
                      <SelectTrigger className="h-8 w-32 bg-secondary text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card text-foreground">
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {roleLabels[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
              {profiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
