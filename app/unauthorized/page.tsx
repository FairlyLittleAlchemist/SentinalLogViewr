import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have permission to view this page. Contact an admin to request access.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">Go to dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/account">Account settings</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
