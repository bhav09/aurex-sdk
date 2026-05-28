"use client"

import { useEffect, useState, useCallback } from "react"
import { aurixAPI } from "@/lib/api-client"

interface Project {
    id: string
    org_id: string
    name: string
    environment: string
}

interface Stats {
    total_events: number
    total_cost: number
    spend_7d: number
    spend_24h: number
    total_tokens: number
    unique_workflows: number
    unique_models: number
    top_models: Array<{ model: string; cost: number; calls: number }>
    date_range: { first_event: string | null; last_event: string | null }
}

interface Workflow {
    workflow_id: string
    event_count: number
    total_cost: number
    total_tokens: number
    start_time: string | null
    end_time: string | null
}

interface LLMEvent {
    id: string
    timestamp: string
    provider: string
    model: string
    workflow_id: string | null
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cost: number
}

function fmt$(n: number) {
    if (n >= 1) return `$${n.toFixed(2)}`
    if (n >= 0.01) return `$${n.toFixed(4)}`
    return `$${n.toFixed(6)}`
}

function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return `${n}`
}

function fmtTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    })
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border bg-card p-5 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
    )
}

function InstallSnippet({ projectId }: { projectId: string }) {
    return (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-4">
            <p className="text-muted-foreground text-sm">No events yet. Set up the SDK to start tracking spend.</p>
            <div className="inline-block text-left space-y-2">
                <p className="text-xs text-muted-foreground">Python</p>
                <pre className="rounded bg-muted px-4 py-3 text-sm font-mono whitespace-pre-wrap">
{`pip install aurex-sdk
aurex install-hook

export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_...   # from API Keys
python your_app.py`}
                </pre>
                <p className="text-xs text-muted-foreground">Node</p>
                <pre className="rounded bg-muted px-4 py-3 text-sm font-mono whitespace-pre-wrap">
{`npm install aurex-sdk
npx aurex install-hook

AUREX_ENABLED=1 AUREX_API_KEY=aux_dev_... node app.js`}
                </pre>
            </div>
            <p className="text-xs text-muted-foreground">Events appear within 30 seconds.</p>
        </div>
    )
}

export default function AppHome() {
    const [projects, setProjects] = useState<Project[]>([])
    const [selectedProject, setSelectedProject] = useState<string>("")
    const [stats, setStats] = useState<Stats | null>(null)
    const [workflows, setWorkflows] = useState<Workflow[]>([])
    const [events, setEvents] = useState<LLMEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        aurixAPI.listProjects()
            .then((ps) => {
                setProjects(ps)
                if (ps.length > 0) setSelectedProject(ps[0].id)
                else setLoading(false)
            })
            .catch((e) => {
                setError(e.message)
                setLoading(false)
            })
    }, [])

    const loadData = useCallback(async (projectId: string) => {
        setLoading(true)
        setError(null)
        try {
            const [s, wf, ev] = await Promise.all([
                aurixAPI.getProjectStats(projectId || undefined),
                aurixAPI.getProjectWorkflows(projectId || undefined),
                aurixAPI.getEvents({ limit: 50, project_id: projectId || undefined }),
            ])
            setStats(s)
            setWorkflows(wf)
            setEvents(ev as unknown as LLMEvent[])
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (selectedProject) loadData(selectedProject)
    }, [selectedProject, loadData])

    const isEmpty = !loading && stats?.total_events === 0

    return (
        <div className="space-y-6">
            {/* Header + project selector */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Real-time SDK spend by project</p>
                </div>
                {projects.length > 0 && (
                    <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.environment})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading && (
                <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
            )}

            {!loading && projects.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No projects found.{" "}
                    <a href="/app/api-keys" className="underline">Create an API key</a>{" "}
                    to auto-create your first project.
                </div>
            )}

            {!loading && projects.length > 0 && (
                <>
                    {/* Stat tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <StatTile
                            label="Total spend"
                            value={stats ? fmt$(stats.total_cost) : "—"}
                            sub={stats?.date_range.first_event ? `since ${fmtTime(stats.date_range.first_event)}` : undefined}
                        />
                        <StatTile
                            label="Last 7 days"
                            value={stats ? fmt$(stats.spend_7d) : "—"}
                        />
                        <StatTile
                            label="Last 24 h"
                            value={stats ? fmt$(stats.spend_24h) : "—"}
                        />
                        <StatTile
                            label="Events"
                            value={stats ? stats.total_events.toLocaleString() : "—"}
                            sub={stats ? `${stats.unique_models} model${stats.unique_models !== 1 ? "s" : ""}` : undefined}
                        />
                    </div>

                    {isEmpty ? (
                        <InstallSnippet projectId={selectedProject} />
                    ) : (
                        <>
                            {/* Top models */}
                            {stats && stats.top_models.length > 0 && (
                                <div className="rounded-lg border p-5">
                                    <h2 className="text-sm font-medium mb-4">Top models by spend</h2>
                                    <div className="space-y-3">
                                        {stats.top_models.map((m) => {
                                            const pct = stats.total_cost > 0 ? (m.cost / stats.total_cost) * 100 : 0
                                            return (
                                                <div key={m.model} className="space-y-1">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="font-mono text-foreground truncate max-w-[60%]">{m.model}</span>
                                                        <span className="text-muted-foreground tabular-nums">
                                                            {fmt$(m.cost)} · {m.calls.toLocaleString()} calls
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-primary"
                                                            style={{ width: `${Math.max(pct, 2)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Top workflows */}
                            {workflows.length > 0 && (
                                <div className="rounded-lg border p-5">
                                    <h2 className="text-sm font-medium mb-4">Top workflows</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b text-left text-muted-foreground">
                                                    <th className="pb-2 pr-4 font-medium">Workflow</th>
                                                    <th className="pb-2 pr-4 font-medium text-right">Spend</th>
                                                    <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                                                    <th className="pb-2 font-medium text-right">Tokens</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {workflows.slice(0, 8).map((wf) => (
                                                    <tr key={wf.workflow_id} className="border-b last:border-0">
                                                        <td className="py-2 pr-4 font-mono truncate max-w-[160px]">{wf.workflow_id}</td>
                                                        <td className="py-2 pr-4 text-right tabular-nums">{fmt$(wf.total_cost)}</td>
                                                        <td className="py-2 pr-4 text-right tabular-nums">{wf.event_count.toLocaleString()}</td>
                                                        <td className="py-2 text-right tabular-nums">{fmtTokens(wf.total_tokens)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Recent events */}
                            {events.length > 0 && (
                                <div className="rounded-lg border p-5">
                                    <h2 className="text-sm font-medium mb-4">Recent events</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b text-left text-muted-foreground">
                                                    <th className="pb-2 pr-4 font-medium">Time</th>
                                                    <th className="pb-2 pr-4 font-medium">Model</th>
                                                    <th className="pb-2 pr-4 font-medium">Workflow</th>
                                                    <th className="pb-2 pr-4 font-medium text-right">Tokens</th>
                                                    <th className="pb-2 font-medium text-right">Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {events.slice(0, 50).map((ev) => (
                                                    <tr key={ev.id} className="border-b last:border-0">
                                                        <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                                                            {fmtTime(ev.timestamp)}
                                                        </td>
                                                        <td className="py-2 pr-4 font-mono truncate max-w-[140px]">{ev.model}</td>
                                                        <td className="py-2 pr-4 font-mono text-muted-foreground truncate max-w-[120px]">
                                                            {ev.workflow_id ?? "—"}
                                                        </td>
                                                        <td className="py-2 pr-4 text-right tabular-nums">{fmtTokens(ev.total_tokens)}</td>
                                                        <td className="py-2 text-right tabular-nums">{fmt$(ev.cost)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
