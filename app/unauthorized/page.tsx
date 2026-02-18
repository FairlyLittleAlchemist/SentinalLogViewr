import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getTranslations } from "next-intl/server"

export default async function UnauthorizedPage() {
  const t = await getTranslations("auth")
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t("accessDenied")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("accessDeniedDescription")}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">{t("goToDashboard")}</Link>
          </Button>
          <Button asChild>
            <Link href="/account">{t("accountSettings")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
