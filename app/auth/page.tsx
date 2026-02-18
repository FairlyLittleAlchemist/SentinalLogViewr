"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

export default function AuthPage() {
  const t = useTranslations("auth")
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
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
    return message || t("unknownAuthError")
  }

  useEffect(() => {
    const next = searchParams.get("next")
    const errorParam = searchParams.get("error")
    if (next) {
      setMessage(t("pleaseSignIn"))
    }
    if (errorParam === "auth_service_unavailable") {
      setError(t("authUnavailable"))
    }
  }, [searchParams, t])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          router.push(searchParams.get("next") || "/")
        }
      } catch (exception) {
        setError(formatAuthException(exception))
      }
    }

    checkSession()
  }, [router, searchParams, supabase])

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
      } else {
        router.push(searchParams.get("next") || "/")
      }
    } catch (exception) {
      setError(formatAuthException(exception))
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
      } else {
        if (data.session) {
          router.push("/")
        } else {
          setMessage(t("confirmEmail"))
        }
      }
    } catch (exception) {
      setError(formatAuthException(exception))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password&type=recovery`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (resetError) {
        setError(resetError.message)
      } else {
        setMessage(t("resetEmailSent"))
      }
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-foreground">{t("accessTitle")}</CardTitle>
              <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px]">
                {t("secureLogin")}
              </Badge>
            </div>
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

            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-secondary/60">
                <TabsTrigger value="sign-in">{t("signInTab")}</TabsTrigger>
                <TabsTrigger value="sign-up">{t("signUpTab")}</TabsTrigger>
                <TabsTrigger value="reset">{t("resetTab")}</TabsTrigger>
              </TabsList>

              <TabsContent value="sign-in">
                <form className="space-y-3" onSubmit={handleSignIn}>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("email")}</label>
                    <Input
                      type="email"
                      required
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("password")}</label>
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("signingIn") : t("signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="sign-up">
                <form className="space-y-3" onSubmit={handleSignUp}>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("fullName")}</label>
                    <Input
                      type="text"
                      placeholder={t("fullNamePlaceholder")}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("email")}</label>
                    <Input
                      type="email"
                      required
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("password")}</label>
                    <Input
                      type="password"
                      required
                      placeholder={t("createStrongPassword")}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("creatingAccount") : t("createAccount")}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    {t("newAccountRoleHint")}
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="reset">
                <form className="space-y-3" onSubmit={handleReset}>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("email")}</label>
                    <Input
                      type="email"
                      required
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="bg-secondary"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("sending") : t("sendResetLink")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
