"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, DollarSign, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import { aurexAPI } from "@/lib/api-client"

interface OverviewData {
  total_spend_7d: number
  total_events: number
  success_rate: number
  health_score: number
  model_breakdown: Array<{ model: string; cost: number; pct: number }>
  top_issues: Array<{ rank: number; name: string; severity: string; cost_per_week: number }>
}

interface EventsData {
  events: Array<{
    id: string
    timestamp: string
    model: string
    workflow_id: string | null
    input_tokens: number
    output_tokens: number
    cost: number
    retry_count: number
    outcome: string
  }>
  page: number
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [events, setEvents] = useState<EventsData["events"]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "data">("overview")
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const token = aurexAPI.getToken()
        if (!token) {
          console.log("No token found")
          return
        }
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
        console.log("Fetching overview from:", apiUrl)
        const res = await fetch(`${apiUrl}/dashboard/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setOverview(data)
          setIsLive(true)
        } else {
          console.error("Overview fetch failed:", res.status, await res.text())
        }
      } catch (e) {
        console.error("Failed to fetch overview:", e)
      }
    }

    const fetchEvents = async () => {
      try {
        const token = aurexAPI.getToken()
        if (!token) return
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
        const res = await fetch(`${apiUrl}/dashboard/events?page=1&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events)
        } else {
          console.error("Events fetch failed:", res.status, await res.text())
        }
      } catch (e) {
        console.error("Failed to fetch events:", e)
      } finally {
        setLoading(false)
      }
    }

    fetchOverview()
    fetchEvents()

    // Poll for updates every 5s
    const interval = setInterval(() => {
      fetchOverview()
      fetchEvents()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isLive ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live
              </span>
            ) : (
              "Offline"
            )}
          </p>
        </div>
        <Link href="/app/api-keys" className="text-sm text-blue-600 hover:underline">
          API Keys
        </Link>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b">
        {(["overview", "data"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Overview" : "Data View"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : activeTab === "overview" ? (
        <div className="grid gap-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> 7-Day Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${overview?.total_spend_7d.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Total Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.total_events}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.success_rate.toFixed(1)}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Health Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.health_score}/100</div>
              </CardContent>
            </Card>
          </div>

          {/* Model breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Model Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview?.model_breakdown.map((m) => (
                  <div key={m.model} className="flex justify-between text-sm">
                    <span className="font-mono">{m.model}</span>
                    <span className="text-muted-foreground">
                      ${m.cost.toFixed(2)} ({m.pct.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Issues */}
          {overview && overview.top_issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Issues</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {overview.top_issues.map((issue) => (
                    <div
                      key={issue.rank}
                      className="flex justify-between items-center border-b pb-3 last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{issue.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {issue.severity} · ${issue.cost_per_week.toFixed(2)}/week
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* Data View */
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3 font-semibold">Timestamp</th>
                    <th className="text-left py-2 px-3 font-semibold">Model</th>
                    <th className="text-left py-2 px-3 font-semibold">Tokens</th>
                    <th className="text-left py-2 px-3 font-semibold">Cost</th>
                    <th className="text-left py-2 px-3 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 text-xs font-mono text-muted-foreground">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3 font-mono text-sm">{e.model}</td>
                      <td className="py-2 px-3 text-sm">
                        {e.input_tokens + e.output_tokens}
                      </td>
                      <td className="py-2 px-3 text-sm font-semibold">${e.cost.toFixed(4)}</td>
                      <td className="py-2 px-3 text-xs">
                        <span
                          className={`inline-block px-2 py-1 rounded font-mono ${
                            e.outcome === "success"
                              ? "bg-green-500/10 text-green-700"
                              : e.outcome === "failure"
                              ? "bg-red-500/10 text-red-700"
                              : "bg-gray-500/10 text-gray-700"
                          }`}
                        >
                          {e.outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
