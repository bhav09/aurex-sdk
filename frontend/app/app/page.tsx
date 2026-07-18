"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { aurexAPI, LLMEvent } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  DollarSign,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Clock,
  Zap,
  Cpu,
  Layers,
  TrendingDown,
  ArrowUpRight,
  FileText,
  X,
  Sparkles,
  Loader2
} from "lucide-react";

interface OverviewData {
  total_spend_7d: number;
  llm_spend_7d: number;
  total_events: number;
  success_rate: number;
  success_count: number;
  failure_count: number;
  retry_rate: number;
  retry_event_count: number;
  cost_per_successful_outcome: number | null;
  health_score: number;
  model_breakdown: Array<{ model: string; cost: number; pct: number }>;
  workflow_breakdown: Array<{
    workflow_id: string;
    cost_7d: number;
    success_count: number;
    cost_per_success: number | null;
  }>;
  top_issues: Array<{ rank: number; name: string; severity: string; cost_per_week: number }>;
}

interface SavingsItem {
  workflow_id: string;
  baseline_cost_per_success: number;
  current_cost_per_success: number;
  delta_per_task: number;
  estimated_monthly_saved_usd: number;
  confidence: string;
  sample_size: number;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; environment: string }>>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<LLMEvent[]>([]);
  const [savings, setSavings] = useState<SavingsItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "traces" | "workflows" | "models">("overview");
  const [selectedEvent, setSelectedEvent] = useState<LLMEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLive, setIsLive] = useState(false);

  const selectedProject = useMemo(() => {
    return projects.find(p => p.id === projectId) || null;
  }, [projects, projectId]);

  // Load Projects on Mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const projs = await aurexAPI.listProjects();
        setProjects(projs);
        if (projs.length > 0) {
          const activeProj = aurexAPI.getProjectId();
          if (activeProj && projs.some(p => p.id === activeProj)) {
            setProjectId(activeProj);
          } else {
            setProjectId(projs[0].id);
            aurexAPI.setProjectId(projs[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load projects", err);
      }
    }
    void loadProjects();
  }, []);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const token = aurexAPI.getToken();
      if (!token) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://aurex-backend-858789082997.us-central1.run.app/api/v1";
      const q = `?project_id=${encodeURIComponent(projectId)}`;

      // Parallel fetches
      const [overviewRes, statsRes, savingsRes, eventsData] = await Promise.all([
        fetch(`${apiUrl}/dashboard/overview${q}`, { headers: { Authorization: `Bearer ${token}` } }),
        aurexAPI.getProjectStats(projectId),
        fetch(`${apiUrl}/savings/verified${q}`, { headers: { Authorization: `Bearer ${token}` } }),
        aurexAPI.getEvents({ project_id: projectId, limit: 100 })
      ]);

      if (overviewRes.ok) {
        setOverview(await overviewRes.json());
        setIsLive(true);
      }
      if (statsRes) {
        setStats(statsRes);
      }
      if (savingsRes.ok) {
        const savs = await savingsRes.json();
        setSavings(savs.items || []);
      }
      if (eventsData) {
        setEvents(eventsData);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchData();

    const interval = setInterval(() => {
      void fetchData();
    }, 8000);

    return () => clearInterval(interval);
  }, [projectId, fetchData]);

  // Handle Project selection change
  const handleProjectChange = (id: string) => {
    setProjectId(id);
    aurexAPI.setProjectId(id);
  };

  // Aggregated Weekly Savings
  const weeklySavings = useMemo(() => {
    return savings.reduce((acc, s) => acc + (s.estimated_monthly_saved_usd * 7) / 30, 0);
  }, [savings]);

  // Aggregated Cached Tokens
  const totalCachedTokens = useMemo(() => {
    return events.reduce((acc, e) => acc + Number(e.extra_metadata?.cache_read_tokens || 0), 0);
  }, [events]);

  // Timeline Data for Charting
  const timelineData = useMemo(() => {
    if (!events.length) return [];

    // Group by day
    const dailyMap: Record<string, { date: string; totalTokens: number; cachedTokens: number; cost: number; calls: number }> = {};

    events.forEach(e => {
      const dateStr = new Date(e.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const cached = Number(e.extra_metadata?.cache_read_tokens || 0);
      const total = Number(e.total_tokens || 0);
      const cost = Number(e.cost || 0);

      if (dailyMap[dateStr]) {
        dailyMap[dateStr].totalTokens += total;
        dailyMap[dateStr].cachedTokens += cached;
        dailyMap[dateStr].cost += cost;
        dailyMap[dateStr].calls += 1;
      } else {
        dailyMap[dateStr] = {
          date: dateStr,
          totalTokens: total,
          cachedTokens: cached,
          cost: cost,
          calls: 1
        };
      }
    });

    // Sort chronologically (oldest first)
    return Object.values(dailyMap).reverse();
  }, [events]);

  // Filtered Events for Traces tab
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    return events.filter(e =>
      e.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.workflow_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.provider?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.response?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [events, searchQuery]);

  return (
    <div className="flex flex-col gap-6 text-white min-h-screen bg-background">
      {/* Header Panel */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/[0.06] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif uppercase tracking-wide">Overview</h1>
            {isLive ? (
              <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 gap-1.5 py-0.5 px-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Feed
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-zinc-500/10 border-zinc-500/20 text-zinc-400">Offline</Badge>
            )}
          </div>
          <p className="text-white/40 text-xs">
            Monitor real-time token ledger details, cache efficiencies, and cost saves.
          </p>
        </div>

        {/* Project Switcher */}
        <div className="flex items-center gap-3">
          {selectedProject && (
            <Badge variant="outline" className="border-white/10 text-white/50 bg-white/[0.02]">
              Environment: <span className="text-teal-400 ml-1 font-mono uppercase text-[10px]">{selectedProject.environment}</span>
            </Badge>
          )}
          {projects.length > 0 ? (
            <Select value={projectId || ""} onValueChange={handleProjectChange}>
              <SelectTrigger className="w-[180px] bg-surface border-white/10 text-white font-sans text-xs">
                <SelectValue placeholder="Select Project" />
              </SelectTrigger>
              <SelectContent className="bg-surface border-white/10 text-white font-sans">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-white/30">Loading workspace…</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {[
          { id: "overview", label: "Dashboard" },
          { id: "traces", label: "Traces & Ledgers" },
          { id: "workflows", label: "Workflows" },
          { id: "models", label: "Models" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSelectedEvent(null);
            }}
            className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all duration-300 ${activeTab === tab.id
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-white/40 hover:text-white/70"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          <span className="text-xs text-white/40 font-mono">Querying token ledger database…</span>
        </div>
      ) : (
        <div className="relative flex gap-6 items-start">

          {/* Main Content Area */}
          <div className="flex-1 space-y-6 min-w-0">

            {activeTab === "overview" && (
              <>
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Total Cost */}
                  <Card className="bg-surface border-white/[0.06] hover:border-white/10 transition-all duration-300">
                    <CardHeader className="pb-2 space-y-1">
                      <CardTitle className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-white/30" /> Weekly Cost
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-serif text-white/90">
                        ${overview?.total_spend_7d != null ? overview.total_spend_7d.toFixed(2) : "0.00"}
                      </div>
                      <p className="text-[10px] text-white/40 mt-1 flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {overview?.total_events ?? 0} request events
                      </p>
                    </CardContent>
                  </Card>

                  {/* Cost Saved */}
                  <Card className="bg-surface border-white/[0.06] hover:border-white/10 transition-all duration-300">
                    <CardHeader className="pb-2 space-y-1">
                      <CardTitle className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-emerald-400/70" /> Weekly Cost Saved
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-serif text-emerald-400">
                        ${weeklySavings > 0 ? weeklySavings.toFixed(2) : "0.00"}
                      </div>
                      <p className="text-[10px] text-emerald-400/60 mt-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Via cache baselines
                      </p>
                    </CardContent>
                  </Card>

                  {/* Tokens Processed */}
                  <Card className="bg-surface border-white/[0.06] hover:border-white/10 transition-all duration-300">
                    <CardHeader className="pb-2 space-y-1">
                      <CardTitle className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-white/30" /> Total Tokens
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-serif text-white/90">
                        {stats?.total_tokens ? stats.total_tokens.toLocaleString() : "0"}
                      </div>
                      <p className="text-[10px] text-white/40 mt-1">
                        {stats?.unique_models ?? 0} active models
                      </p>
                    </CardContent>
                  </Card>

                  {/* Tokens Saved */}
                  <Card className="bg-surface border-white/[0.06] hover:border-white/10 transition-all duration-300">
                    <CardHeader className="pb-2 space-y-1">
                      <CardTitle className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-teal-400/70" /> Cached Tokens
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-serif text-teal-400">
                        {totalCachedTokens ? totalCachedTokens.toLocaleString() : "0"}
                      </div>
                      <p className="text-[10px] text-teal-400/60 mt-1">
                        {stats?.total_tokens && totalCachedTokens
                          ? `${((totalCachedTokens / stats.total_tokens) * 100).toFixed(1)}% cache hit rate`
                          : "0.0% hit rate"}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Success Rate */}
                  <Card className="bg-surface border-white/[0.06] hover:border-white/10 transition-all duration-300">
                    <CardHeader className="pb-2 space-y-1">
                      <CardTitle className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-white/30" /> Success Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-serif text-white/90">
                        {overview?.success_rate != null ? overview.success_rate.toFixed(1) : "0.0"}%
                      </div>
                      <p className="text-[10px] text-white/40 mt-1">
                        Retry Rate: {overview?.retry_rate?.toFixed(1) ?? "0.0"}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Token Volume Area Chart */}
                  <Card className="bg-surface border-white/[0.06]">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xs uppercase tracking-wider text-white/60">Token Savings & Volume</CardTitle>
                      <CardDescription className="text-white/40 text-[10px]">Tally of total tokens vs tokens served from cache.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      {timelineData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineData}>
                            <defs>
                              <linearGradient id="totalTokensColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FFFFFF" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="cachedTokensColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818CF8" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e34" />
                            <XAxis dataKey="date" stroke="#666" fontSize={10} />
                            <YAxis stroke="#666" fontSize={10} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                            <Tooltip contentStyle={{ backgroundColor: "surface", borderColor: "#404048", color: "#FFF" }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Area type="monotone" name="Total Volume" dataKey="totalTokens" stroke="#FFFFFF" fillOpacity={1} fill="url(#totalTokensColor)" strokeWidth={1.5} />
                            <Area type="monotone" name="Cached Savings" dataKey="cachedTokens" stroke="#818CF8" fillOpacity={1} fill="url(#cachedTokensColor)" strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-white/30">Not enough data to render timeline chart.</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Spend Bar Chart */}
                  <Card className="bg-surface border-white/[0.06]">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xs uppercase tracking-wider text-white/60">LLM Spend Timeline</CardTitle>
                      <CardDescription className="text-white/40 text-[10px]">Daily cost associated with prompt requests.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      {timelineData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e34" />
                            <XAxis dataKey="date" stroke="#666" fontSize={10} />
                            <YAxis stroke="#666" fontSize={10} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                            <Tooltip contentStyle={{ backgroundColor: "surface", borderColor: "#404048", color: "#FFF" }} formatter={(v: number) => [`$${v.toFixed(4)}`, "Daily Spend"]} />
                            <Bar name="Spend" dataKey="cost" fill="#FFFFFF" opacity={0.8} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-white/30">Not enough data to render spend chart.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Bottom Row - verified savings and warnings */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Verified savings */}
                  <Card className="bg-surface border-white/[0.06] lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-xs uppercase tracking-wider text-white/60">Savings Baselines by Workflow</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {savings.length > 0 ? (
                        <div className="space-y-4">
                          {savings.map((s) => (
                            <div key={s.workflow_id} className="flex justify-between items-start border-b border-white/[0.04] pb-3 last:border-0 last:pb-0">
                              <div className="space-y-0.5">
                                <p className="text-xs font-mono text-teal-300 font-semibold">{s.workflow_id}</p>
                                <p className="text-[10px] text-white/40">
                                  Baseline: ${s.baseline_cost_per_success.toFixed(4)}/run → Current: ${s.current_cost_per_success.toFixed(4)}/run
                                </p>
                              </div>
                              <div className="text-right space-y-1">
                                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0">
                                  +${s.estimated_monthly_saved_usd}/mo save
                                </Badge>
                                <p className="text-[9px] text-white/30">Confidence: {s.confidence} (n={s.sample_size})</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-xs text-white/30 py-8">
                          No workflow savings registered yet. Keep running the SDK to establish baselines.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Issues / Alert Rules */}
                  <Card className="bg-surface border-white/[0.06]">
                    <CardHeader>
                      <CardTitle className="text-xs uppercase tracking-wider text-white/60">Anomalies & Issues</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {overview && overview.top_issues.length > 0 ? (
                        <div className="space-y-3">
                          {overview.top_issues.map((issue) => (
                            <div key={issue.rank} className="flex justify-between items-center p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                              <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-white/80">{issue.name}</p>
                                <p className="text-[9px] text-rose-400">Severity: {issue.severity}</p>
                              </div>
                              <span className="text-xs text-white/50 font-mono">${issue.cost_per_week.toFixed(2)}/wk</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-xs text-white/30 py-8">
                          No ledger anomalies detected in the past 7 days.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Traces / Ledger Tab */}
            {activeTab === "traces" && (
              <Card className="bg-surface border-white/[0.06]">
                <CardHeader className="flex flex-row justify-between items-center flex-wrap gap-4 pb-4">
                  <div>
                    <CardTitle className="text-xs uppercase tracking-wider text-white/60">Trace Events & Ledger Records</CardTitle>
                    <CardDescription className="text-white/40 text-[10px]">Select any transaction line to inspect prompts, inputs, and payloads.</CardDescription>
                  </div>
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-white/30" />
                    <Input
                      placeholder="Search traces..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] text-xs text-white placeholder-white/30 rounded-lg"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredEvents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="border-white/[0.06]">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-white/40 text-xs py-2.5">Time</TableHead>
                            <TableHead className="text-white/40 text-xs py-2.5">Model</TableHead>
                            <TableHead className="text-white/40 text-xs py-2.5">Workflow</TableHead>
                            <TableHead className="text-white/40 text-xs py-2.5">Tokens</TableHead>
                            <TableHead className="text-white/40 text-xs py-2.5">Cost</TableHead>
                            <TableHead className="text-white/40 text-xs py-2.5">Outcome</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEvents.map((e) => {
                            const isCached = Number(e.extra_metadata?.cache_read_tokens || 0) > 0;
                            return (
                              <TableRow
                                key={e.id}
                                onClick={() => setSelectedEvent(e)}
                                className={`border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-all ${selectedEvent?.id === e.id ? "bg-white/[0.03]" : ""
                                  }`}
                              >
                                <TableCell className="py-3 font-mono text-[10px] text-white/40">
                                  {new Date(e.timestamp).toLocaleTimeString()}
                                </TableCell>
                                <TableCell className="py-3 font-mono text-xs">
                                  {e.model}
                                </TableCell>
                                <TableCell className="py-3 font-mono text-[10px] text-teal-300">
                                  {e.workflow_id || "-"}
                                </TableCell>
                                <TableCell className="py-3 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span>{e.total_tokens || (e.input_tokens + e.output_tokens)}</span>
                                    {isCached && (
                                      <Badge className="bg-teal-500/10 text-teal-400 border-teal-500/20 text-[9px] py-0 px-1 font-mono">
                                        ⚡ cached
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 text-xs font-mono text-white/70">
                                  ${e.cost != null ? e.cost.toFixed(4) : "0.0000"}
                                </TableCell>
                                <TableCell className="py-3">
                                  <Badge
                                    variant="outline"
                                    className={
                                      e.outcome === "success"
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[10px]"
                                        : e.outcome === "failure"
                                          ? "bg-rose-500/10 border-rose-500/20 text-rose-400 text-[10px]"
                                          : "bg-zinc-500/10 border-zinc-500/20 text-zinc-400 text-[10px]"
                                    }
                                  >
                                    {e.outcome || "success"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-white/30 py-12">
                      No trace events matching filter found.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Workflows Tab */}
            {activeTab === "workflows" && (
              <Card className="bg-surface border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-xs uppercase tracking-wider text-white/60">Active Workflows & Features</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview?.workflow_breakdown && overview.workflow_breakdown.length > 0 ? (
                    <Table>
                      <TableHeader className="border-white/[0.06]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-white/40 text-xs">Workflow ID</TableHead>
                          <TableHead className="text-white/40 text-xs">7-Day Spend</TableHead>
                          <TableHead className="text-white/40 text-xs">Successful Runs</TableHead>
                          <TableHead className="text-white/40 text-xs">Avg Cost/Success</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.workflow_breakdown.map((w) => (
                          <TableRow key={w.workflow_id} className="border-white/[0.04] hover:bg-white/[0.01]">
                            <TableCell className="font-mono text-xs text-teal-300">{w.workflow_id}</TableCell>
                            <TableCell className="text-xs font-mono">${w.cost_7d.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">{w.success_count}</TableCell>
                            <TableCell className="text-xs font-mono text-white/70">
                              {w.cost_per_success != null ? `$${w.cost_per_success.toFixed(4)}` : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center text-xs text-white/30 py-8">
                      No workflow breakdowns found. Ingest sdk traces to trigger workflow calculations.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Models Tab */}
            {activeTab === "models" && (
              <Card className="bg-surface border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-xs uppercase tracking-wider text-white/60">LLM Model Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview?.model_breakdown && overview.model_breakdown.length > 0 ? (
                    <Table>
                      <TableHeader className="border-white/[0.06]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-white/40 text-xs">Model Identifier</TableHead>
                          <TableHead className="text-white/40 text-xs">Spend Share</TableHead>
                          <TableHead className="text-white/40 text-xs">Percentage Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.model_breakdown.map((m) => (
                          <TableRow key={m.model} className="border-white/[0.04] hover:bg-white/[0.01]">
                            <TableCell className="font-mono text-xs">{m.model}</TableCell>
                            <TableCell className="text-xs font-mono">${m.cost.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-3">
                                <span className="w-12 text-right">{m.pct.toFixed(1)}%</span>
                                <div className="flex-1 bg-white/[0.04] rounded-full h-1.5 max-w-[120px]">
                                  <div className="bg-white h-full rounded-full" style={{ width: `${m.pct}%` }} />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center text-xs text-white/30 py-8">
                      No models loaded.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>

          {/* Trace Inspector Sidebar/Panel */}
          {selectedEvent && (
            <Card className="w-[380px] bg-surface/95 border-white/10 shrink-0 sticky top-24 self-start max-h-[80vh] overflow-y-auto z-30 shadow-2xl rounded-2xl animate-in slide-in-from-right duration-200">
              <CardHeader className="pb-3 border-b border-white/[0.06] flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-serif uppercase tracking-wider">Trace Details</CardTitle>
                  <CardDescription className="text-[10px] text-white/40 font-mono mt-0.5">{selectedEvent.id.slice(0, 8)}…{selectedEvent.id.slice(-8)}</CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedEvent(null)} className="h-7 w-7 text-white/50 hover:text-white rounded-full hover:bg-white/5">
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="pt-4 space-y-5 text-xs">

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl font-mono">
                  <div>
                    <span className="text-[9px] uppercase text-white/30 block">Cost</span>
                    <span className="text-sm font-semibold">${selectedEvent.cost != null ? selectedEvent.cost.toFixed(5) : "0.00"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-white/30 block">Tokens</span>
                    <span className="text-sm font-semibold">{selectedEvent.total_tokens || (selectedEvent.input_tokens + selectedEvent.output_tokens)}</span>
                  </div>
                </div>

                {/* Config */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                    <span className="text-white/40">Model</span>
                    <span className="font-mono font-semibold">{selectedEvent.model}</span>
                  </div>
                  {selectedEvent.workflow_id && (
                    <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                      <span className="text-white/40">Workflow</span>
                      <span className="font-mono text-teal-300">{selectedEvent.workflow_id}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                    <span className="text-white/40">Provider</span>
                    <span className="font-mono">{selectedEvent.provider || "openai"}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                    <span className="text-white/40">Time</span>
                    <span>{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* Prompt */}
                {selectedEvent.prompt && (
                  <div className="space-y-1.5">
                    <span className="text-white/40 text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Prompt Input
                    </span>
                    <pre className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-x-auto font-mono text-[10px] text-white/80 whitespace-pre-wrap max-h-44">
                      {selectedEvent.prompt}
                    </pre>
                  </div>
                )}

                {/* Response */}
                {selectedEvent.response && (
                  <div className="space-y-1.5">
                    <span className="text-white/40 text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" /> Model Response
                    </span>
                    <pre className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-x-auto font-mono text-[10px] text-white/85 whitespace-pre-wrap max-h-44">
                      {selectedEvent.response}
                    </pre>
                  </div>
                )}

                {/* Extra Metadata */}
                {selectedEvent.extra_metadata && Object.keys(selectedEvent.extra_metadata).length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-white/40 text-[10px] uppercase font-bold">Metadata Payload</span>
                    <pre className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-x-auto font-mono text-[9px] text-white/60">
                      {JSON.stringify(selectedEvent.extra_metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </div>
  );
}
