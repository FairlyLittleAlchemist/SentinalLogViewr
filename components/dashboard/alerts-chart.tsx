"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
  ComposedChart,
} from "recharts"
import type { TimeSeriesPoint } from "@/lib/mock-data"
import { useLocale, useTranslations } from "next-intl"

interface AlertsChartProps {
  series: TimeSeriesPoint[]
}

export function AlertsChart({ series }: AlertsChartProps) {
  const t = useTranslations("dashboard")
  const locale = useLocale()

  // Calculate total alerts for each point
  const enhancedSeries = series.map(point => ({
    ...point,
    total: (point.critical || 0) + (point.high || 0) + (point.medium || 0) + (point.low || 0)
  }))

  const formatHour = (value: string) => {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
  }

  const formatTooltipLabel = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0)
      return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">
            {formatTooltipLabel(label)}
          </p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground capitalize">{entry.dataKey}</span>
                </div>
                <span className="font-medium text-foreground">{entry.value}</span>
              </div>
            ))}
            <div className="border-t border-border pt-1 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Total</span>
                <span className="font-semibold text-foreground">{total}</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="interactive-surface hover-lift border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">{t("alertTrend")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("last24h")}</span>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={enhancedSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="criticalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="mediumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="lowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                tickFormatter={formatHour}
              />
              <YAxis
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{
                  fontSize: "11px",
                  color: "hsl(215, 20%, 55%)",
                  paddingTop: "10px"
                }}
              />
              <Area
                type="monotone"
                dataKey="critical"
                stroke="hsl(0, 72%, 51%)"
                fill="url(#criticalGrad)"
                strokeWidth={2}
                animationDuration={1000}
              />
              <Area
                type="monotone"
                dataKey="high"
                stroke="hsl(38, 92%, 50%)"
                fill="url(#highGrad)"
                strokeWidth={2}
                animationDuration={1000}
                animationBegin={200}
              />
              <Area
                type="monotone"
                dataKey="medium"
                stroke="hsl(199, 89%, 48%)"
                fill="url(#mediumGrad)"
                strokeWidth={2}
                animationDuration={1000}
                animationBegin={400}
              />
              <Area
                type="monotone"
                dataKey="low"
                stroke="hsl(142, 71%, 45%)"
                fill="url(#lowGrad)"
                strokeWidth={2}
                animationDuration={1000}
                animationBegin={600}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="hsl(215, 20%, 35%)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={1000}
                animationBegin={800}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
