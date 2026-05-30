"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, DollarSign, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"
import Link from "next/link"
import { aurexAPI } from "@/lib/api-client"
import { ProjectSelector } from "@/components/app/project-selector"

interface OverviewData {
  total_spend_7d: number
  total_events: number
  success_rate: number
  health_score: number
  retry_rate?: number
  cost_per_successful_outcome?: number | null
  model_breakdown: Array<{ model: string; cost: number; pct: number }>
  workflow_breakdown?: Array<{
    workflow_id: string
    cost_7d: number
    success_count: number
    cost_per_success: number | null
  }>
  top_issues: Array<{ rank: number; name: string; severity: string; cost_per_week: number }>
}

interface SavingsItem {
  workflow_id: string
  baseline_cost_per_success: number
  current_cost_per_success: number
  estimated_monthly_saved_usd: number
  confidence: string
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
  const [savings, setSavings] = useState<SavingsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "data">("overview")
  const [isLive, setIsLive] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"

  const projectQuery = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""

  const fetchOverview = useCallback(async () => {
    const token = aurexAPI.getToken()
    if (!token) return
    const res = await fetch(`${apiUrl}/dashboard/overview${projectQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setOverview(await res.json())
      setIsLive(true)
    }
  }, [apiUrl, projectQuery])

  const fetchEvents = useCallback(async () => {
    const token = aurexAPI.getToken()
    if (!token) return
    const res = await fetch(`${apiUrl}/dashboard/events?page=1&limit=50${projectId ? `&project_id=${projectId}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setEvents(data.events)
    }
    setLoading(false)
  }, [apiUrl, projectId])

  const fetchSavings = useCallback(async () => {
    const token = aurexAPI.getToken()
    if (!token) return
    const q = projectId ? `?project_id=${projectId}` : ""
    const res = await fetch(`${apiUrl}/savings/verified${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setSavings(data.items || [])
    }
  }, [apiUrl, projectId])

  useEffect(() => {
    fetchOverview()
    fetchEvents()
    fetchSavings()
    const interval = setInterval(() => {
      fetchOverview()
      fetchEvents()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchOverview, fetchEvents, fetchSavings])

  useEffect(() => {
    const token = aurexAPI.getToken()
    if (!token) return
    const url = `${apiUrl}/dashboard/realtime${projectId ? `?project_id=${projectId}` : ""}`
    const es = new EventSource(url, { withCredentials: false } as EventSourceInit)
    // EventSource cannot set Authorization — rely on polling for auth; SSE uses poll backend without bearer.
    // Fallback: close SSE and use polling only when token required.
    es.close()
    return undefined
  }, [apiUrl, projectId])

  return (
    <div className="flex flex-col gap-6 p-6 bg-zinc-950 min-h-screen text-zinc-100">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {isLive ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            ) : (
              "Offline"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSelector value={projectId} onChange={setProjectId} />
          <Link href="/app/api-keys" className="text-sm text-emerald-400 hover:underline">
            API Keys
          </Link>
        </div>
      </div>

      <div className="flex gap-2 border-b border-zinc-800">
        {(["overview", "data"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? "border-b-2 border-emerald-500 text-emerald-400"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {tab === "overview" ? "Overview" : "Data View"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Loading...</div>
      ) : activeTab === "overview" ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> 7-Day Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${overview?.total_spend_7d.toFixed(2) ?? "0.00"}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.total_events ?? 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.success_rate.toFixed(1) ?? 0}%</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Retry Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.retry_rate?.toFixed(1) ?? 0}%</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Cost / Success
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overview?.cost_per_successful_outcome != null
                    ? `$${overview.cost_per_successful_outcome.toFixed(4)}`
                    : "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          {overview?.workflow_breakdown && overview.workflow_breakdown.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Top Workflows by Spend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overview.workflow_breakdown.map((w) => (
                  <div key={w.workflow_id} className="flex justify-between text-sm">
                    <span className="font-mono text-emerald-300">{w.workflow_id}</span>
                    <span className="text-zinc-400">
                      ${w.cost_7d.toFixed(2)}
                      {w.cost_per_success != null && ` · $${w.cost_per_success.toFixed(4)}/success`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {savings.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Verified Savings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {savings.map((s) => (
                  <div key={s.workflow_id} className="text-sm border-b border-zinc-800 pb-2 last:border-0">
                    <p className="font-medium">{s.workflow_id}</p>
                    <p className="text-zinc-400">
                      Was ${s.baseline_cost_per_success.toFixed(4)}/task → now $
                      {s.current_cost_per_success.toFixed(4)}/task · ~$
                      {s.estimated_monthly_saved_usd}/mo saved · {s.confidence}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle>Model Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview?.model_breakdown.map((m) => (
                <div key={m.model} className="flex justify-between text-sm">
                  <span className="font-mono">{m.model}</span>
                  <span className="text-zinc-400">
                    ${m.cost.toFixed(2)} ({m.pct.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {overview && overview.top_issues.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Top Issues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.top_issues.map((issue) => (
                  <div key={issue.rank} className="flex justify-between text-sm">
                    <span>{issue.name}</span>
                    <span className="text-zinc-500">{issue.severity}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-800">
                  <tr className="text-zinc-500 text-xs">
                    <th className="text-left py-2 px-3">Time</th>
                    <th className="text-left py-2 px-3">Model</th>
                    <th className="text-left py-2 px-3">Workflow</th>
                    <th className="text-left py-2 px-3">Tokens</th>
                    <th className="text-left py-2 px-3">Cost</th>
                    <th className="text-left py-2 px-3">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-2 px-3 text-xs font-mono text-zinc-500">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3 font-mono">{e.model}</td>
                      <td className="py-2 px-3 font-mono text-xs text-zinc-400">{e.workflow_id || "—"}</td>
                      <td className="py-2 px-3">{e.input_tokens + e.output_tokens}</td>
                      <td className="py-2 px-3">${e.cost.toFixed(4)}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            e.outcome === "success"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : e.outcome === "failure"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-zinc-500/10 text-zinc-400"
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
