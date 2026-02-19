"use client"

import { Profiler, type ReactNode } from "react"

type Props = {
  id: string
  children: ReactNode
  thresholdMs?: number
}

export function RenderProfiler({ id, children, thresholdMs = 24 }: Props) {
  return (
    <Profiler
      id={id}
      onRender={(profilerId, phase, actualDuration) => {
        if (typeof window !== "undefined" && !window.location.search.includes("perf=1")) return
        if (actualDuration < thresholdMs) return
        console.info(`[perf] ${profilerId} ${phase} ${actualDuration.toFixed(1)}ms`)
      }}
    >
      {children}
    </Profiler>
  )
}
