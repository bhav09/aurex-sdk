"use client";

import { useEffect, useState } from "react";
import {
    TrendingUp,
    DollarSign,
    Calendar,
    PieChart as PieIcon,
    RefreshCw,
    AlertCircle,
    CheckCircle2
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
    Legend,
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

const COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#f87171"];

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
            <div className="py-20 text-center text-xs text-white/40 flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-violet-400" />
                <span className="text-sm font-medium">Fetching savings realization timeline...</span>
            </div>
        );
    }

    if (error) {
        return (
            <Card className="mx-auto max-w-2xl border-red-500/20 bg-red-500/5 p-6 backdrop-blur-md text-center space-y-4">
                <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                <h3 className="font-semibold text-white text-lg">Failed to load Savings Realization</h3>
                <p className="text-sm text-white/50">{error}</p>
                <Button
                    onClick={fetchSavingsData}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-medium"
                >
                    Retry
                </Button>
            </Card>
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
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="font-display text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                        <TrendingUp className="h-7 w-7 text-emerald-400" />
                        Savings Realization
                    </h2>
                    <p className="text-sm text-white/50">
                        Monitor cost optimization progress and realized savings over time for <strong className="text-white">{companyName}</strong>.
                    </p>
                </div>
                <Button
                    onClick={fetchSavingsData}
                    variant="outline"
                    className="h-9 gap-1.5 border-white/10 bg-white/5 text-xs text-white hover:bg-white/10 w-fit"
                    disabled={loading}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh Stats
                </Button>
            </div>

            {/* Informational Banner */}
            <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-emerald-500/10 p-5 backdrop-blur-md">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-violet-400" />
                    </div>
                    <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-white text-sm">What is Savings Realization?</h3>
                        <p className="text-xs text-white/70 leading-relaxed">
                            This dashboard tracks the <strong className="text-white">actual cost savings</strong> you've achieved by implementing Aurex's optimization recommendations.
                            It shows the difference between your <strong className="text-emerald-400">previous wasteful spending</strong> and your <strong className="text-violet-400">current optimized costs</strong> after fixes are deployed.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/10">
                            <div className="flex items-start gap-2">
                                <span className="text-emerald-400 text-lg">✓</span>
                                <div>
                                    <p className="text-[11px] font-medium text-white">Real Savings</p>
                                    <p className="text-[10px] text-white/50">Actual $ saved after implementing fixes</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-violet-400 text-lg">📊</span>
                                <div>
                                    <p className="text-[11px] font-medium text-white">Timeline Tracking</p>
                                    <p className="text-[10px] text-white/50">Monitor savings progress over time</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-blue-400 text-lg">🎯</span>
                                <div>
                                    <p className="text-[11px] font-medium text-white">ROI Validation</p>
                                    <p className="text-[10px] text-white/50">Prove optimization impact to stakeholders</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Metrics cards */}
            <div className="grid gap-6 sm:grid-cols-2">
                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md flex items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                    <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <DollarSign className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="text-xs text-white/50 block font-medium uppercase tracking-wider">Total Realized Savings</span>
                        <span className="text-3xl font-bold text-white font-mono mt-0.5 block">
                            ${data.total_realized_savings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-emerald-400 mt-1 block">✓ Successfully saved and optimized</span>
                    </div>
                </Card>

                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md flex items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500" />
                    <div className="h-12 w-12 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400">
                        <TrendingUp className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="text-xs text-white/50 block font-medium uppercase tracking-wider">Annualized Run-Rate Savings</span>
                        <span className="text-3xl font-bold text-white font-mono mt-0.5 block">
                            ${data.annualized_savings_run_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-violet-400 mt-1 block">⚡ Projected yearly optimization run-rate</span>
                    </div>
                </Card>
            </div>

            {/* Savings Timeline Chart */}
            <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-violet-400" />
                        Savings & Waste Timeline
                    </h3>
                    <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-white/70">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Realized Savings
                        </span>
                        <span className="flex items-center gap-1.5 text-white/70">
                            <span className="h-2 w-2 rounded-full bg-red-400" /> Wasted Costs
                        </span>
                    </div>
                </div>

                <div className="h-80 w-full font-mono text-[10px]">
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
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorWaste" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="rgba(255,255,255,0.3)"
                                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                />
                                <YAxis stroke="rgba(255,255,255,0.3)" />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0d0d12",
                                        borderColor: "rgba(255,255,255,0.1)",
                                        color: "#fff",
                                        borderRadius: "8px"
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
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total_waste"
                                    name="Wasted Costs"
                                    stroke="#ef4444"
                                    fillOpacity={1}
                                    fill="url(#colorWaste)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </Card>

            {/* Category Breakdown Chart */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md md:col-span-2 space-y-4">
                    <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                        <PieIcon className="h-5 w-5 text-violet-400" />
                        Savings Breakdown by Optimization Vector
                    </h3>
                    <div className="h-64 w-full font-mono text-[10px]">
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
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis type="number" stroke="rgba(255,255,255,0.3)" />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke="rgba(255,255,255,0.3)"
                                        width={100}
                                        tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "#0d0d12",
                                            borderColor: "rgba(255,255,255,0.1)",
                                            color: "#fff",
                                            borderRadius: "8px"
                                        }}
                                        formatter={(value: any) => [`$${Number(value).toFixed(2)}`]}
                                    />
                                    <Bar dataKey="value" name="Savings Amount" radius={[0, 4, 4, 0]}>
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
                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md md:col-span-1 space-y-4">
                    <h3 className="font-semibold text-white text-sm">Realized Savings Action Items</h3>
                    <div className="space-y-3.5">
                        <div className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-white/70 leading-normal">
                                <strong>System Prompts:</strong> Merged static prefixes, saving up to 40% on cache hits.
                            </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-white/70 leading-normal">
                                <strong>Model Selection:</strong> Offloaded routine parsing tasks to Claude 3 Haiku / GPT-4o-mini.
                            </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-white/70 leading-normal">
                                <strong>Agent Loop Tuning:</strong> Added safety break-conditions preventing exponential usage.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
