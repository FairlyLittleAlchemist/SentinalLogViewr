"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"

export default function PowerBIDashboard() {
  return (
    <DashboardLayout>
      <AppHeader title="Dashboard Power BI" />
      <div className="flex-1 min-h-0">
        <iframe
          title="molkarapport"
          src="https://app.powerbi.com/reportEmbed?reportId=92af073f-8f76-49d7-8957-2589f22f0032&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730"
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </DashboardLayout>
  )
}
