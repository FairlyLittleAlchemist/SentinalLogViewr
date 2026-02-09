"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserRoleTable } from "@/components/admin/user-role-table"

export default function AdminDashboardPage() {
  return (
    <DashboardLayout>
      <AppHeader title="Admin Dashboard" />
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Access Control</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Manage user roles and access levels for Sentinel Command. Admins can update roles for any user.
          </CardContent>
        </Card>

        <UserRoleTable title="Role Management" />
      </div>
    </DashboardLayout>
  )
}
