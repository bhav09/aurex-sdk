"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Calendar,
    PieChart as PieIcon,
    RefreshCw,
    CheckCircle2,
    Cpu,
    TrendingUp,
    Upload,
    Shield,
    ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aurexAPI, type ExecutiveSummary } from "@/lib/api-client";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
} from "recharts";

interface SavingsTimelineItem {
    date: string;
    realized_savings: number;
    total_waste: number;
    wasted_cost?: number;
}

interface SavingsData {
    total_realized_savings: number;
    annualized_savings_run_rate: number;
    timeline: SavingsTimelineItem[];
    category_breakdown: Record<string, number>;
}

interface SavingsPanelProps {
    companyName: string;
    executiveSummary?: ExecutiveSummary["executive_summary"];
    hasActiveSession?: boolean;
}

const COLORS = ["#a78bfa", "#10b981", "#60a5fa", "#f472b6", "#fbbf24", "#f87171"];

type ViewMode = "live" | "projected" | "empty" | "setup";

function normalizeTimeline(timeline: SavingsTimelineItem[]): SavingsTimelineItem[] {
    return timeline.map((row) => ({
        ...row,
        total_waste: row.total_waste ?? row.wasted_cost ?? 0,
    }));
}

function buildProjectedFromAudit(summary: ExecutiveSummary["executive_summary"]): SavingsData {
    const annual =
        summary.annual_savings_projection ||
        Math.round((summary.wasted_amount || 0) * 52 * 0.35 * 100) / 100;
    const monthly = Math.round(annual / 12);
    const realized = Math.max(
        Math.round((summary.wasted_amount || 0) * 0.35 * 100) / 100,
        monthly,
    );

    const breakdown: Record<string, number> = {};
    if (summary.wasted_amount > 0) {
        breakdown.expensive_model_misuse = Math.round(summary.wasted_amount * 0.4 * 52 * 100) / 100;
        breakdown.runaway_loop = Math.round(summary.wasted_amount * 0.25 * 52 * 100) / 100;
        breakdown.context_explosion = Math.round(summary.wasted_amount * 0.2 * 52 * 100) / 100;
    }

    return {
        total_realized_savings: realized,
        annualized_savings_run_rate: annual,
        timeline: [
            {
                date: new Date().toISOString().slice(0, 10),
                realized_savings: monthly,
                total_waste: summary.wasted_amount || 0,
            },
        ],
        category_breakdown: breakdown,
    };
}

function isEmptySavings(data: SavingsData): boolean {
    return (
        data.total_realized_savings <= 0 &&
        data.annualized_savings_run_rate <= 0 &&
        data.timeline.length === 0 &&
        Object.keys(data.category_breakdown).length === 0
    );
}

function SavingsSetupState({
    title,
    description,
    steps,
}: {
    title: string;
    description: string;
    steps: Array<{ icon: ReactNode; title: string; detail: string }>;
}) {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-surface-raised/90 p-8 space-y-6">
            <div className="space-y-2">
                <h2 className="font-display text-lg font-bold text-white">{title}</h2>
                <p className="text-sm text-white/50 font-mono leading-relaxed max-w-2xl">{description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                {steps.map((step, idx) => (
                    <div
                        key={step.title}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-2"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-wider">
                            <span className="text-emerald-400">0{idx + 1}</span>
                            {step.icon}
                        </div>
                        <p className="text-sm font-semibold text-white/90">{step.title}</p>
                        <p className="text-[11px] text-white/45 font-mono leading-relaxed">{step.detail}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SavingsPanel({
    companyName,
    executiveSummary,
    hasActiveSession = false,
}: SavingsPanelProps) {
    const [data, setData] = useState<SavingsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("setup");
    const [statusNote, setStatusNote] = useState<string | null>(null);

    const projectedFromAudit = useMemo(
        () => (executiveSummary ? buildProjectedFromAudit(executiveSummary) : null),
        [executiveSummary],
    );

    const fetchSavingsData = async () => {
        if (!companyName) {
            setData(null);
            setViewMode("setup");
            setStatusNote(null);
            return;
        }

        if (!aurexAPI.hasActiveSession()) {
            setData(projectedFromAudit);
            setViewMode(projectedFromAudit ? "projected" : "setup");
            setStatusNote("Sign in to sync verified savings history for your organization.");
            return;
        }

        setLoading(true);
        setStatusNote(null);
        try {
            const res = await aurexAPI.getSavingsRealization(companyName);
            const normalized: SavingsData = {
                ...res,
                timeline: normalizeTimeline(res.timeline || []),
            };

            if (isEmptySavings(normalized)) {
                if (projectedFromAudit) {
                    setData(projectedFromAudit);
                    setViewMode("projected");
                    setStatusNote(
                        "No historical savings sessions yet. Showing projected ROI from your latest audit.",
                    );
                } else {
                    setData(normalized);
                    setViewMode("empty");
                }
            } else {
                setData(normalized);
                setViewMode("live");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to load savings data";
            if (projectedFromAudit) {
                setData(projectedFromAudit);
                setViewMode("projected");
                setStatusNote(message);
            } else if (message.includes("Not authorized") || message.includes("Sign in")) {
                setData(null);
                setViewMode("setup");
                setStatusNote(message);
            } else {
                setData(null);
                setViewMode("empty");
                setStatusNote(message);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSavingsData();
    }, [companyName, executiveSummary]);

    if (loading && !data) {
        return (
            <div className="py-16 text-center flex flex-col items-center gap-3">
                <RefreshCw className="h-7 w-7 animate-spin text-emerald-400" />
                <span className="text-[11px] font-mono text-muted-foreground">Loading savings realization...</span>
            </div>
        );
    }

    if (viewMode === "setup") {
        return (
            <SavingsSetupState
                title="Savings tracking not configured yet"
                description={
                    statusNote ||
                    "Complete an audit with your company name to unlock verified savings timelines, category breakdowns, and ROI run-rate projections."
                }
                steps={[
                    {
                        icon: <Upload className="h-3.5 w-3.5" />,
                        title: "Upload audit data",
                        detail: "Run an audit from Overview with your work email and company name.",
                    },
                    {
                        icon: <Shield className="h-3.5 w-3.5" />,
                        title: "Apply fixes",
                        detail: "Ship SDK guards, caching, and model routing recommendations.",
                    },
                    {
                        icon: <TrendingUp className="h-3.5 w-3.5" />,
                        title: "Track ROI here",
                        detail: "Return after remediation to compare baseline leakage vs realized savings.",
                    },
                ]}
            />
        );
    }

    if ((viewMode === "empty" || !data) && !projectedFromAudit) {
        return (
            <div className="space-y-4">
                <SavingsSetupState
                    title="No savings recorded yet"
                    description={
                        statusNote ||
                        `We have not found verified savings sessions for ${companyName || "this workspace"}. Once optimizations are applied and a follow-up audit runs, ROI will appear here automatically.`
                    }
                    steps={[
                        {
                            icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                            title: "Baseline captured",
                            detail: hasActiveSession
                                ? "Your first audit established a waste baseline."
                                : "Run your first audit to establish a baseline.",
                        },
                        {
                            icon: <Cpu className="h-3.5 w-3.5" />,
                            title: "Deploy optimizations",
                            detail: "Enable guards from Insights and re-run high-volume workflows.",
                        },
                        {
                            icon: <ArrowRight className="h-3.5 w-3.5" />,
                            title: "Re-audit to verify",
                            detail: "Upload a fresh ledger export to measure realized dollar savings.",
                        },
                    ]}
                />
                <div className="flex justify-end">
                    <Button
                        onClick={fetchSavingsData}
                        variant="outline"
                        className="h-8 text-[11px] font-mono border-white/10"
                    >
                        <RefreshCw className="h-3 w-3 mr-2" />
                        Check again
                    </Button>
                </div>
            </div>
        );
    }

    const displayData = data || projectedFromAudit!;
    const categoryChartData = Object.entries(displayData.category_breakdown).map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
    }));

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Savings Realization</h2>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {viewMode === "live" ? "Verified" : "Projected"} ROI
                        {companyName ? (
                            <>
                                {" "}
                                for <span className="text-muted-foreground">{companyName}</span>
                            </>
                        ) : null}
                    </p>
                </div>
                <Button
                    onClick={fetchSavingsData}
                    className="h-7 gap-1.5 border border-border bg-surface text-[10px] text-muted-foreground hover:text-white hover:bg-[#2e2e34] w-fit font-mono rounded-md shrink-0 transition-all"
                    disabled={loading}
                >
                    <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {statusNote && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[11px] font-mono text-amber-200/90">
                    {statusNote}
                </div>
            )}

            {viewMode === "projected" && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-[11px] font-mono text-teal-200/90">
                    Projected from your current audit analysis. Verified savings will replace these estimates after
                    follow-up audits.
                </div>
            )}

            <Card className="border-emerald-500/20 bg-gradient-to-br from-teal-950/10 to-emerald-950/10 p-5 backdrop-blur-md relative overflow-hidden rounded-xl">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-white text-sm">Savings audit framework</h3>
                        <p className="text-xs text-white/60 leading-relaxed font-mono">
                            Tracks realized dollar savings from baseline leakage through optimized spend - cache hits,
                            model downgrades, and loop prevention.
                        </p>
                    </div>
                </div>
            </Card>

            <div className="rounded-xl border border-white/[0.08] bg-surface-raised/90 backdrop-blur-md overflow-hidden">
                <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
                    <div className="flex-1 px-6 py-5 space-y-1.5">
                        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-white/35">
                            {viewMode === "live" ? "Total realized savings" : "Projected monthly savings"}
                        </p>
                        <p className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
                            $
                            {displayData.total_realized_savings.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                            })}
                        </p>
                        <p className="text-[10px] font-mono text-white/25">per month equivalent</p>
                    </div>
                    <div className="flex-1 px-6 py-5 space-y-1.5">
                        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-white/35">
                            Annualized run-rate
                        </p>
                        <p className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
                            $
                            {displayData.annualized_savings_run_rate.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                            })}
                        </p>
                        <p className="text-[10px] font-mono text-white/25">yearly projection basis</p>
                    </div>
                    <div className="flex-1 px-6 py-5 space-y-1.5">
                        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-white/35">
                            ROI multiple
                        </p>
                        <p className="text-2xl font-display font-bold text-[#2dd4bf] tabular-nums">
                            {displayData.annualized_savings_run_rate > 0
                                ? `${Math.max(3, Math.round(displayData.annualized_savings_run_rate / 600))}×`
                                : "-"}
                        </p>
                        <p className="text-[10px] font-mono text-white/25">vs tooling cost baseline</p>
                    </div>
                </div>
            </div>

            <Card className="border-white/[0.08] bg-surface-raised/80 p-6 backdrop-blur-md space-y-4 rounded-xl shadow-xl">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                    <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-white/40 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-emerald-400/70" />
                        Savings vs leakage timeline
                    </h3>
                </div>
                <div className="h-72 w-full font-mono text-[9px]">
                    {displayData.timeline.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-white/40 px-6">
                            <TrendingUp className="h-8 w-8 text-white/20" />
                            <p className="text-sm text-white/50">Timeline populates after your second audit</p>
                            <p className="text-[11px] font-mono text-white/30">
                                We compare each new session against your original baseline to chart realized savings.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={displayData.timeline}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorWaste" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="rgba(255,255,255,0.2)"
                                    tickFormatter={(val) =>
                                        new Date(val).toLocaleDateString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                        })
                                    }
                                />
                                <YAxis stroke="rgba(255,255,255,0.2)" />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0d0d12",
                                        borderColor: "rgba(255,255,255,0.08)",
                                        color: "#fff",
                                        borderRadius: "8px",
                                        fontSize: "10px",
                                        fontFamily: "monospace",
                                    }}
                                    labelFormatter={(val) =>
                                        new Date(val).toLocaleDateString(undefined, { dateStyle: "medium" })
                                    }
                                    formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="realized_savings"
                                    name="Realized savings"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorSavings)"
                                    strokeWidth={1.5}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total_waste"
                                    name="Wasted costs"
                                    stroke="#ef4444"
                                    fillOpacity={1}
                                    fill="url(#colorWaste)"
                                    strokeWidth={1.5}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-white/[0.08] bg-surface-raised/80 p-6 backdrop-blur-md md:col-span-2 space-y-4 rounded-xl shadow-xl">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
                        <PieIcon className="h-4 w-4 text-emerald-400" />
                        Savings vector allocation
                    </h3>
                    <div className="h-60 w-full font-mono text-[9px]">
                        {categoryChartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-white/40 text-center px-4">
                                Category breakdown appears when optimization vectors are detected in audit issues.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={categoryChartData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                    <XAxis type="number" stroke="rgba(255,255,255,0.2)" />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke="rgba(255,255,255,0.2)"
                                        width={110}
                                        tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 9 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "#0d0d12",
                                            borderColor: "rgba(255,255,255,0.08)",
                                            color: "#fff",
                                            borderRadius: "8px",
                                            fontSize: "10px",
                                            fontFamily: "monospace",
                                        }}
                                        formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`]}
                                    />
                                    <Bar dataKey="value" name="Savings amount" radius={[0, 4, 4, 0]} barSize={12}>
                                        {categoryChartData.map((entry, index) => (
                                            <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>

                <Card className="border-white/[0.08] bg-surface-raised/80 p-6 backdrop-blur-md md:col-span-1 space-y-4 rounded-xl shadow-xl flex flex-col justify-between">
                    <div>
                        <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-white/40 mb-4 flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-emerald-400/70" />
                            Optimization vectors
                        </h3>
                        <div className="space-y-4">
                            {[
                                "Prefix caching: unified static system prompts for 40%+ token reuse.",
                                "Haiku offload: route simple classification to smaller models.",
                                "Loop guards: stop infinite recursive agent calls in production.",
                            ].map((text) => (
                                <div key={text} className="flex items-start gap-2.5">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-white/70 leading-relaxed font-mono">{text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
