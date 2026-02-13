"use client"

import React from "react"

import { AppSidebar } from "@/components/app-sidebar"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      <main className="flex flex-1 flex-col overflow-hidden animate-fade-in">
        {children}
      </main>
    </div>
  )
}
