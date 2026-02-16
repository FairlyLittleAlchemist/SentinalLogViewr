"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const formatAuthException = (exception: unknown) => {
    const message = exception instanceof Error ? exception.message : String(exception)
    const lower = message.toLowerCase()
    if (lower.includes("failed to fetch") || lower.includes("fetch")) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      return `Network/auth request failed. Check that Supabase is reachable and NEXT_PUBLIC_SUPABASE_URL is correct.${url ? ` (${url})` : ""}`
    }
    return message || "Unknown authentication error."
  }

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          setMessage("Use the password recovery link from your email to continue.")
        }
      } catch (exception) {
        setError(formatAuthException(exception))
      }
    }

    checkSession()
  }, [supabase])

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      setMessage("Password updated. Redirecting to dashboard...")
      setTimeout(() => router.push("/"), 1500)
    } catch (exception) {
      setError(formatAuthException(exception))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="bg-card border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Update your password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <form className="space-y-3" onSubmit={handleUpdate}>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">New password</label>
                <Input
                  type="password"
                  required
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Confirm password</label>
                <Input
                  type="password"
                  required
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="bg-secondary"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
