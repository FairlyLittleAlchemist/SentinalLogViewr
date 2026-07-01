"use client"

import React from "react"
import { AppSidebar } from "@/components/app-sidebar"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      
      {/* MODIFICATION ICI : 
          1. On remplace "overflow-visible" par "overflow-y-auto"
          2. Cela crée une zone de défilement dédiée pour le contenu à droite
      */}
      <main className="flex flex-1 flex-col overflow-auto min-h-0 animate-fade-in">
        {children}
      </main>
    </div>
  )
}