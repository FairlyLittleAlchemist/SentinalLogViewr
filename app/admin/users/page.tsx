import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { UserRoleTable } from "@/components/admin/user-role-table"
import { getTranslations } from "next-intl/server"

export default async function UserManagementPage() {
  const t = await getTranslations("pages")
  return (
    <DashboardLayout>
      <AppHeader title={t("userManagement")} />
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 lg:p-6">
        <UserRoleTable title="User Roles" />
      </div>
    </DashboardLayout>
  )
}
