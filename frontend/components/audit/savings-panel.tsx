"use client";

import { useEffect, useState } from "react";
import {
    Calendar,
    PieChart as PieIcon,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Cpu
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aurixAPI } from "@/lib/api-client";
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
    Cell
} from "recharts";

interface SavingsTimelineItem {
    date: string;
    realized_savings: number;
    total_waste: number;
}

interface SavingsData {
    total_realized_savings: number;
    annualized_savings_run_rate: number;
    timeline: SavingsTimelineItem[];
    category_breakdown: Record<string, number>;
}

interface SavingsPanelProps {
    companyName: string;
}

const COLORS = ["#a78bfa", "#10b981", "#60a5fa", "#f472b6", "#fbbf24", "#f87171"];

export function SavingsPanel({ companyName }: SavingsPanelProps) {
    const [data, setData] = useState<SavingsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSavingsData = async () => {
        if (!companyName) return;
        setLoading(true);
        setError(null);
        try {
            const res = await aurixAPI.getSavingsRealization(companyName);
            setData(res);
        } catch (err: any) {
            console.error("Error fetching savings data:", err);
            setError(err.message || "Failed to fetch savings realization data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSavingsData();
    }, [companyName]);

    if (loading && !data) {
        return (
            <div className="py-16 text-center flex flex-col items-center gap-3">
                <RefreshCw className="h-7 w-7 animate-spin text-violet-400" />
                <span className="text-[11px] font-mono text-[#555]">Fetching savings realization data...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                    <p className="text-[12px] font-semibold text-red-300">Failed to load Savings Realization</p>
                    <p className="text-[11px] text-[#888] mt-1">{error}</p>
                    <button onClick={fetchSavingsData} className="mt-3 text-[11px] text-white/60 hover:text-white border border-[#333] rounded-lg px-3 py-1.5 transition-colors">Retry</button>
                </div>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    // Process category breakdown to chart array format
    const categoryChartData = Object.entries(data.category_breakdown).map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        value
    }));

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#222] pb-4">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Savings Realization</h2>
                    <p className="text-[11px] font-mono text-[#555] mt-0.5">
                        Verified cost savings for <span className="text-[#888]">{companyName}</span>
                    </p>
                </div>
                <Button
                    onClick={fetchSavingsData}
                    className="h-7 gap-1.5 border border-[#2a2a2a] bg-[#1a1a1a] text-[10px] text-[#666] hover:text-white hover:bg-[#222] w-fit font-mono rounded-md shrink-0 transition-all"
                    disabled={loading}
                >
                    <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Informational Banner */}
            <Card className="border-violet-500/20 bg-gradient-to-br from-violet-950/10 to-emerald-950/10 p-5 backdrop-blur-md relative overflow-hidden rounded-xl">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-violet-400" />
                    </div>
                    <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-white text-sm">Savings Audit Framework</h3>
                        <p className="text-xs text-white/60 leading-relaxed font-mono">
                            This dashboard tracks the <strong className="text-white">actual realized dollar savings</strong> achieved by shipping Aurex SDK optimization directives. It shows baseline historical leakage versus optimized spending structures.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/[0.05]">
                            <div className="flex items-start gap-2.5">
                                <span className="text-emerald-400 text-xs font-mono">01</span>
                                <div>
                                    <p className="text-[11px] font-semibold text-white/80">Active Control Plane</p>
                                    <p className="text-[10px] text-white/40 leading-normal">Actual tokens saved via live cache policies</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <span className="text-violet-400 text-xs font-mono">02</span>
                                <div>
                                    <p className="text-[11px] font-semibold text-white/80">Continuous Analysis</p>
                                    <p className="text-[10px] text-white/40 leading-normal">Telemetry metrics verified against baseline</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <span className="text-indigo-400 text-xs font-mono">03</span>
                                <div>
                                    <p className="text-[11px] font-semibold text-white/80">ROI Certification</p>
                                    <p className="text-[10px] text-white/40 leading-normal">Accurate ledger logs for budget audits</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Datadog-style KPI strip */}
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0c0e]/90 backdrop-blur-md overflow-hidden">
                <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
                    <div className="flex-1 px-6 py-5 space-y-1.5">
                        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-white/35">Total Realized Savings</p>
                        <p className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
                            ${data.total_realized_savings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] font-mono text-white/25">verified tokens preserved</p>
                    </div>
                    <div className="flex-1 px-6 py-5 space-y-1.5">
                        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-white/35">Annualized Run-Rate</p>
                        <p className="text-2xl font-display font-bold text-violet-400 tabular-nums">
                            ${data.annualized_savings_run_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] font-mono text-white/25">yearly projection basis</p>
                    </div>
                </div>
            </div>

            {/* Savings Timeline Chart */}
            <Card className="border-white/[0.08] bg-[#0c0c0e]/80 p-6 backdrop-blur-md space-y-4 rounded-xl shadow-xl">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                    <div>
                        <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-white/40 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-violet-400/70" />
                            Savings vs Leakage Timeline
                        </h3>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-mono">
                        <span className="flex items-center gap-1.5 text-white/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Savings
                        </span>
                        <span className="flex items-center gap-1.5 text-white/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Waste
                        </span>
                    </div>
                </div>

                <div className="h-72 w-full font-mono text-[9px]">
                    {data.timeline.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-white/40">
                            No timeline data available.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={data.timeline}
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
                                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                />
                                <YAxis stroke="rgba(255,255,255,0.2)" />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0d0d12",
                                        borderColor: "rgba(255,255,255,0.08)",
                                        color: "#fff",
                                        borderRadius: "8px",
                                        fontSize: "10px",
                                        fontFamily: "monospace"
                                    }}
                                    labelFormatter={(val) => new Date(val).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="realized_savings"
                                    name="Realized Savings"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorSavings)"
                                    strokeWidth={1.5}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total_waste"
                                    name="Wasted Costs"
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

            {/* Category Breakdown Chart */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-white/[0.08] bg-[#0c0c0e]/80 p-6 backdrop-blur-md md:col-span-2 space-y-4 rounded-xl shadow-xl">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
                        <PieIcon className="h-4 w-4 text-violet-400" />
                        Savings Vector Allocation
                    </h3>
                    <div className="h-60 w-full font-mono text-[9px]">
                        {categoryChartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-white/40">
                                No breakdown data available.
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
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "#0d0d12",
                                            borderColor: "rgba(255,255,255,0.08)",
                                            color: "#fff",
                                            borderRadius: "8px",
                                            fontSize: "10px",
                                            fontFamily: "monospace"
                                        }}
                                        formatter={(value: any) => [`$${Number(value).toFixed(2)}`]}
                                    />
                                    <Bar dataKey="value" name="Savings Amount" radius={[0, 4, 4, 0]} barSize={12}>
                                        {categoryChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>

                {/* Savings recommendations */}
                <Card className="border-white/[0.08] bg-[#0c0c0e]/80 p-6 backdrop-blur-md md:col-span-1 space-y-4 rounded-xl shadow-xl flex flex-col justify-between">
                    <div>
                        <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-white/40 mb-4 flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-violet-400/70" />
                            Optimization Vectors
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-white/70 leading-relaxed font-mono">
                                    <strong>Prefix Caching</strong>: Unified static system content instructions, achieving 40%+ token reuse bounds.
                                </p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-white/70 leading-relaxed font-mono">
                                    <strong>Haiku Offload</strong>: Automated document segmentation parsed by smaller models at low cost.
                                </p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-white/70 leading-relaxed font-mono">
                                    <strong>Tuned Loops</strong>: Connect active break counters to stop infinite recursive calls in dev testing.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="text-[9px] font-mono text-white/30 border-t border-white/5 pt-3.5 mt-3">
                        * Direct metrics synced dynamically from target system logs.
                    </div>
                </Card>
            </div>
        </div>
    );
}
