"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadZone } from "@/components/audit/upload-zone";
import { AgentPlanPanel } from "@/components/audit/agent-plan-panel";
import { SettingsPanel } from "@/components/audit/settings-panel";
import { SavingsPanel } from "@/components/audit/savings-panel";
import { AuditCopilotDock } from "@/components/audit/audit-copilot-dock";
import { aurixAPI, ExecutiveSummary, Issue, LLMEvent } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    AlertCircle,
    Zap,
    CheckCircle2,
    ShieldCheck,
    Download,
    AlertTriangle,
    X,
    ChevronDown,
    ChevronRight,
    Sliders,
    Cpu,
    LayoutDashboard,
    Database,
    GitCompare,
    Lightbulb,
    TrendingUp,
    Settings,
    Key,
    Users,
    SquareTerminal,
    ExternalLink,
    Copy,
    Check,
} from "lucide-react";

// ─── Sidebar Nav ────────────────────────────────────────────────────────────

type TabId = "overview" | "data" | "compare" | "insights" | "savings" | "settings";

const NAV_GROUPS = [
    {
        label: "WORKSPACE",
        items: [
            { id: "overview" as TabId, label: "Overview", icon: LayoutDashboard },
            { id: "data" as TabId, label: "Data view", icon: Database },
            { id: "compare" as TabId, label: "Comparison", icon: GitCompare },
        ],
    },
    {
        label: "ANALYSIS",
        items: [
            { id: "insights" as TabId, label: "Insights", icon: Lightbulb, badge: true },
            { id: "savings" as TabId, label: "Savings", icon: TrendingUp },
        ],
    },
    {
        label: "CONFIG",
        items: [
            { id: "settings" as TabId, label: "Settings", icon: Settings },
        ],
    },
];

// ─── Prompt Diff Panel ──────────────────────────────────────────────────────

function PromptDiffPanel({ event, issue }: { event: LLMEvent; issue: Issue | undefined }) {
    const current =
        event.prompt?.trim() ||
        "(No prompt text in this export—many provider CSVs omit message bodies.)";
    const optimized = issue
        ? `${issue.cta ? `${issue.cta}\n\n` : ""}${issue.one_line_summary}`
        : "Route this workload to a smaller model when token count is low; cache static system text; dedupe repeated prefixes.";

    return (
        <div className="grid gap-4 border-t border-[#2a2a2a] bg-[#111111] p-5 md:grid-cols-2">
            <div className="rounded-lg border border-red-500/20 bg-red-950/10 overflow-hidden">
                <div className="flex items-center justify-between bg-red-500/10 px-3 py-2 border-b border-red-500/20">
                    <span className="text-[10px] font-mono font-semibold tracking-wider text-red-400 uppercase">Current Input</span>
                    <span className="text-[9px] bg-red-500/20 px-1.5 py-0.5 rounded text-red-300 font-mono">− Redundant</span>
                </div>
                <div className="p-3 max-h-52 overflow-auto">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-200/70">
                        {current.split('\n').map((line, i) => (
                            <span key={i} className="block px-1">
                                <span className="inline-block w-4 text-red-500/30 select-none mr-2 text-right">{i + 1}</span>
                                {line}
                            </span>
                        ))}
                    </pre>
                </div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 overflow-hidden">
                <div className="flex items-center justify-between bg-emerald-500/10 px-3 py-2 border-b border-emerald-500/20">
                    <span className="text-[10px] font-mono font-semibold tracking-wider text-emerald-400 uppercase">Optimized Output</span>
                    <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300 font-mono">+ Active</span>
                </div>
                <div className="p-3 max-h-52 overflow-auto">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-200/80">
                        {optimized.split('\n').map((line, i) => (
                            <span key={i} className="block px-1">
                                <span className="inline-block w-4 text-emerald-500/30 select-none mr-2 text-right">{i + 1}</span>
                                {line}
                            </span>
                        ))}
                    </pre>
                </div>
            </div>
        </div>
    );
}

// ─── SDK Snippet Footer ─────────────────────────────────────────────────────

function SDKFooter() {
    const [copied, setCopied] = useState(false);
    const snippet = "AUREX_ENABLED=1 AUREX_API_KEY=aux_live_... python my_app.py";
    const copy = () => {
        navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[#888] mb-2">Connect SDK to get live data from your production environment</p>
                <div className="flex items-center gap-2 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2">
                    <SquareTerminal className="h-3.5 w-3.5 text-[#555] shrink-0" />
                    <code className="text-[11px] font-mono text-[#ccc] truncate">{snippet}</code>
                    <button onClick={copy} className="ml-auto shrink-0 text-[#555] hover:text-[#aaa] transition-colors">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <Button className="shrink-0 bg-[#2a2a2a] hover:bg-[#333] text-white border border-[#3a3a3a] text-[11px] font-medium px-4 h-9 rounded-lg">
                Connect SDK
            </Button>
        </div>
    );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({
    data,
    getSeverityColor,
    onViewInData,
    onOpenCopilot,
    resetAudit,
}: {
    data: ExecutiveSummary;
    getSeverityColor: (s: string) => string;
    onViewInData: (issue: Issue) => void;
    onOpenCopilot: (issue: Issue) => void;
    resetAudit: () => void;
}) {
    const calculateScore = (waste: number) => Math.round(100 - waste);
    const score = calculateScore(data.executive_summary.waste_percentage);
    const criticalIssue = data.top_issues.find(i => i.severity === "CRITICAL") ?? data.top_issues[0];

    // Build per-model aggregated data from workflow_breakdown
    const modelMap: Record<string, { cost: number; calls: number }> = {};
    data.workflow_breakdown.forEach(w => {
        w.models_used.forEach(m => {
            if (!modelMap[m]) modelMap[m] = { cost: 0, calls: 0 };
            modelMap[m].cost += w.total_cost / Math.max(1, w.models_used.length);
            modelMap[m].calls += w.request_count;
        });
    });
    const totalModelCost = Object.values(modelMap).reduce((s, v) => s + v.cost, 0);
    const modelEntries = Object.entries(modelMap)
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 4);

    // Workflow status colors
    const getWorkflowStatus = (wfId: string) => {
        const issue = data.top_issues.find(i => i.affected_workflow === wfId);
        if (!issue) return { label: "healthy", color: "text-emerald-400", dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" };
        if (issue.severity === "CRITICAL") return { label: "looping", color: "text-red-400", dot: "bg-red-400", badge: "bg-red-500/15 text-red-400 border-red-500/20" };
        if (issue.severity === "HIGH") return { label: "oversized", color: "text-amber-400", dot: "bg-amber-400", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20" };
        return { label: "warning", color: "text-yellow-400", dot: "bg-yellow-400", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
    };

    const kpis = [
        {
            label: "ANNUAL SAVINGS",
            value: `$${data.executive_summary.annual_savings_projection.toLocaleString()}`,
            sub: "vs last period",
            delta: "+12%",
            deltaPos: true,
            valueColor: "text-emerald-400",
        },
        {
            label: "WEEKLY LEAKAGE",
            value: `$${data.executive_summary.wasted_amount.toFixed(0)}`,
            sub: "recurring waste",
            delta: "+4%",
            deltaPos: false,
            valueColor: "text-red-400",
        },
        {
            label: "WASTE RATE",
            value: `${data.executive_summary.waste_percentage.toFixed(1)}%`,
            sub: "of tokens inefficient",
            valueColor: "text-white",
        },
        {
            label: "HEALTH SCORE",
            value: score.toString(),
            valueSuffix: "/100",
            sub: "spend efficiency index",
            valueColor: "text-white",
        },
    ];


    return (
        <div className="space-y-5">
            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map(kpi => (
                    <div key={kpi.label} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
                        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[#666]">{kpi.label}</p>
                        <div className="flex items-baseline gap-1.5 mt-2.5">
                            <p className={`text-3xl font-display font-bold tabular-nums leading-none ${kpi.valueColor}`}>{kpi.value}</p>
                            {kpi.valueSuffix && <span className="text-base font-mono text-[#555]">{kpi.valueSuffix}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                            {kpi.delta && (
                                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${kpi.deltaPos ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                    {kpi.delta}
                                </span>
                            )}
                            <span className="text-[12px] text-[#555]">{kpi.sub}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Critical Alert Banner */}
            {criticalIssue && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3.5">
                    <div className="shrink-0 mt-0.5 h-4 w-4 rounded border border-amber-500/40 bg-amber-500/20 flex items-center justify-center">
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                    </div>
                    <p className="text-[13px] text-amber-200/90 leading-relaxed">
                        <strong className="text-amber-300">Critical:</strong>{" "}
                        {criticalIssue.one_line_summary}{" "}
                        <span className="text-amber-400/70">Estimated burn rate ${criticalIssue.weekly_cost.toFixed(2)}/wk at current trajectory.</span>
                    </p>
                </div>
            )}

            {/* Two-Column Body */}
            <div className="grid gap-4 lg:grid-cols-5">
                {/* Left: Top Inefficiencies */}
                <div className="lg:col-span-3 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a2a]">
                        <div className="flex items-center gap-2.5">
                            <div className="h-4 w-4 rounded border border-[#444] bg-[#2a2a2a]" />
                            <span className="text-[14px] font-semibold text-white">Top inefficiencies</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { }}
                            className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors flex items-center gap-1"
                        >
                            View all <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="divide-y divide-[#222]">
                        {data.top_issues.slice(0, 4).map(issue => {
                            const sev = issue.severity.toLowerCase();
                            const sevClass = sev === "critical"
                                ? "bg-red-500/15 text-red-400 border-red-500/25"
                                : sev === "high"
                                    ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
                                    : sev === "medium"
                                        ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                                        : "bg-blue-500/15 text-blue-400 border-blue-500/25";
                            return (
                                <button
                                    key={issue.rank}
                                    type="button"
                                    onClick={() => onViewInData(issue)}
                                    className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[#202020] transition-colors group"
                                >
                                    <span className="text-[11px] font-mono text-[#555] pt-0.5 w-6 shrink-0">#{issue.rank}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-semibold text-[#e0e0e0] group-hover:text-white transition-colors leading-tight">
                                            {issue.title}
                                        </p>
                                        <p className="text-[12px] text-[#666] mt-1 leading-snug">
                                            {issue.one_line_summary}
                                        </p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${sevClass}`}>
                                            {sev}
                                        </span>
                                        <span className="text-[12px] font-mono font-bold text-red-400">
                                            −${issue.weekly_cost.toFixed(2)}<span className="text-[#555] font-normal">/wk</span>
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Model Breakdown + Cost per Outcome */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Model Breakdown */}
                    <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="h-4 w-4 rounded border border-[#444] bg-[#2a2a2a]" />
                            <span className="text-[14px] font-semibold text-white">Model breakdown</span>
                        </div>
                        <div className="space-y-3.5">
                            {modelEntries.length > 0 ? modelEntries.map(([model, stats]) => {
                                const pct = totalModelCost > 0 ? Math.round((stats.cost / totalModelCost) * 100) : 0;
                                const barWidth = `${pct}%`;
                                return (
                                    <div key={model} className="flex items-center gap-3">
                                        <div className="w-20 shrink-0">
                                            <p className="text-[12px] font-mono text-[#ccc] truncate">{model}</p>
                                        </div>
                                        <div className="flex-1 h-1.5 rounded-full bg-[#2a2a2a] overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#888]"
                                                style={{ width: barWidth }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[12px] font-mono text-[#ccc]">${stats.cost.toFixed(2)}</span>
                                            <span className="text-[11px] text-[#555] w-8 text-right">{pct}%</span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-[12px] text-[#555] font-mono">No model data available</p>
                            )}
                        </div>
                    </div>

                    {/* Cost per Outcome */}
                    <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
                        <span className="text-[14px] font-semibold text-white block mb-4">Cost per outcome</span>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3.5">
                                <p className="text-[11px] font-mono text-[#555] uppercase tracking-wider">Current</p>
                                <p className="text-xl font-display font-bold text-white mt-1.5 tabular-nums">
                                    ${data.executive_summary.cost_per_outcome_current?.toFixed(2) ?? (data.executive_summary.current_period_spend / Math.max(1, data.total_events)).toFixed(2)}
                                </p>
                            </div>
                            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3.5">
                                <p className="text-[11px] font-mono text-[#555] uppercase tracking-wider">Optimized</p>
                                <p className="text-xl font-display font-bold text-emerald-400 mt-1.5 tabular-nums">
                                    ${data.executive_summary.cost_per_outcome_optimized?.toFixed(2) ?? (data.executive_summary.optimized_spend / Math.max(1, data.total_events)).toFixed(2)}
                                </p>
                            </div>
                            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3.5">
                                <p className="text-[11px] font-mono text-[#555] uppercase tracking-wider">Waste Rate</p>
                                <p className="text-xl font-display font-bold text-white mt-1.5 tabular-nums">
                                    {(100 - data.executive_summary.waste_percentage).toFixed(0)}%
                                </p>
                            </div>
                            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3.5">
                                <p className="text-[11px] font-mono text-[#555] uppercase tracking-wider">Workflows</p>
                                <p className="text-xl font-display font-bold text-amber-400 mt-1.5 tabular-nums">
                                    {data.workflow_breakdown.length}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Workflow Spend Table */}
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a2a]">
                    <div className="flex items-center gap-2.5">
                        <div className="h-4 w-4 rounded border border-[#444] bg-[#2a2a2a]" />
                        <span className="text-[14px] font-semibold text-white">
                            Workflow spend · {data.executive_summary.period_days}d
                        </span>
                    </div>
                    <button className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors flex items-center gap-1.5">
                        Export <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="divide-y divide-[#222]">
                    {data.workflow_breakdown.slice(0, 6).map(wf => {
                        const status = getWorkflowStatus(wf.workflow_id);
                        const displayName = wf.workflow_id === "unknown"
                            ? "Unlabeled Workflow"
                            : wf.workflow_id.startsWith("inferred_session_")
                                ? "Inferred Session"
                                : wf.workflow_id;
                        return (
                            <div key={wf.workflow_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#202020] transition-colors">
                                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${status.dot}`} />
                                <span className="text-[13px] font-mono text-[#ccc] flex-1 truncate min-w-0">{displayName}</span>
                                <span className="text-[12px] text-[#666] shrink-0">{wf.request_count.toLocaleString()} calls</span>
                                <span className="text-[13px] font-mono font-semibold text-[#e0e0e0] shrink-0">${wf.total_cost.toFixed(2)}</span>
                                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border shrink-0 ${status.badge}`}>
                                    {status.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SDK CTA */}
            <SDKFooter />
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AuditPage() {
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState<string[]>([]);
    const [data, setData] = useState<ExecutiveSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>("overview");
    const [events, setEvents] = useState<LLMEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [compareWorkflowA, setCompareWorkflowA] = useState("");
    const [compareWorkflowB, setCompareWorkflowB] = useState("");
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotIssue, setCopilotIssue] = useState<Issue | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState<string>("");
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingUserInfo, setPendingUserInfo] = useState<{ user_name: string; email: string; company_name: string } | null>(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [authRequiredMessage, setAuthRequiredMessage] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        const userInfo = aurixAPI.getUserInfo();
        if (userInfo) {
            setCompanyName(userInfo.company_name);
            setUserEmail(userInfo.email);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const oauthEmail = params.get('email');
        const oauthUserName = params.get('user_name');
        const oauthCompanyName = params.get('company_name');
        const authError = params.get('auth_error');
        if (authError) {
            const msgs: Record<string, string> = { google_denied: 'Google authorization was denied.', google_token_failed: 'Failed to exchange Google authorization code.' };
            setError(msgs[authError] || `Authentication error: ${authError}`);
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }
        if (token && oauthEmail) {
            aurixAPI.setToken(token);
            const info = { user_name: oauthUserName || oauthEmail.split('@')[0], email: oauthEmail, company_name: oauthCompanyName || '' };
            aurixAPI.setUserInfo(info);
            setUserEmail(oauthEmail);
            setCompanyName(oauthCompanyName || '');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const handleRefreshAnalysis = async () => {
        const activeEmail = userEmail || aurixAPI.getUserInfo()?.email;
        if (!activeEmail) return;
        setAnalyzing(true);
        setProgress(0);
        setProgressSteps(["Querying updated pricing overrides...", "Recalculating event costs...", "Regenerating executive summary..."]);
        try {
            const summary = await aurixAPI.getExecutiveSummary(activeEmail);
            setData(summary);
            await loadEvents();
        } catch (e) {
            console.error("Failed to refresh analysis:", e);
            setError("Failed to refresh analysis with updated pricing");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleDownloadReport = async () => {
        let activeSessionId = sessionId;
        const activeEmail = userEmail || aurixAPI.getUserInfo()?.email;
        if (!activeSessionId && activeEmail) {
            try {
                const history = await aurixAPI.getAuditHistory(activeEmail, 0, 1);
                if (history.sessions?.length > 0) activeSessionId = history.sessions[0].id;
            } catch (err) { console.error(err); }
        }
        if (!activeSessionId) { alert("No audit session found. Please perform an audit first."); return; }
        try {
            const blob = await aurixAPI.downloadExecutiveReport(activeSessionId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `aurex-report-${activeSessionId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Failed to download PDF report.");
        }
    };

    const simulateProgress = () => {
        const steps = [
            "Validating file format...", "Parsing data structure...", "Detecting duplicate prompts...",
            "Analyzing token usage patterns...", "Identifying cost inefficiencies...", "Checking for burst patterns...",
            "Evaluating model selection...", "Calculating optimization potential...", "Generating recommendations..."
        ];
        let i = 0;
        const iv = setInterval(() => {
            if (i < steps.length) {
                setProgressSteps(prev => [...prev, steps[i]]);
                setProgress(((i + 1) / (steps.length + 1)) * 100);
                i++;
            } else clearInterval(iv);
        }, 300);
        return iv;
    };

    const handleFileSelect = async (file: File, userInfo: { user_name: string; email: string; company_name: string }) => {
        setAnalyzing(true); setProgress(0); setProgressSteps([]); setError(null);
        setData(null); setEvents([]); setExpandedEventId(null); setCopilotOpen(false); setCopilotIssue(null);
        const iv = simulateProgress();
        try {
            setUserEmail(userInfo.email); setCompanyName(userInfo.company_name);
            const { session, summary } = await aurixAPI.completeAudit(file, userInfo);
            setSessionId(session.id);
            clearInterval(iv);
            setProgressSteps(prev => [...prev, "Finalizing analysis..."]);
            setProgress(100);
            await new Promise(r => setTimeout(r, 500));
            setData(summary);
            setPendingFile(null); setPendingUserInfo(null); setAuthRequired(false); setAuthRequiredMessage(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Upload failed";
            clearInterval(iv);
            const isAuth = ["verification", "authenticate", "authorized", "403", "401"].some(k => message.toLowerCase().includes(k));
            if (isAuth) {
                aurixAPI.clearSession();
                setPendingFile(file); setPendingUserInfo(userInfo); setAuthRequired(true);
                setAuthRequiredMessage("Your session expired. Please enter the new 6-digit verification code sent to your email.");
                try { await aurixAPI.requestOTP(userInfo.email); } catch { }
                setError(null);
            } else {
                setError(message);
            }
        } finally {
            setAnalyzing(false);
        }
    };

    const handleExportCSV = () => {
        const evts = currentEvents?.length > 0 ? currentEvents : events;
        if (!evts?.length) return;
        const headers = ["Timestamp", "Workflow ID", "Provider", "Model", "Cost", "Total Tokens", "Input Tokens", "Output Tokens"];
        const rows = evts.map(e => [e.timestamp || "", e.workflow_id || "", e.provider || "", e.model || "", e.cost?.toFixed(6) || "0", e.total_tokens || "0", e.input_tokens || "0", e.output_tokens || "0"].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "aurex-export.csv";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    useEffect(() => { if (activeTab === "data" && data && events.length === 0) loadEvents(); }, [activeTab, data]);

    const loadEvents = async (workflowFilter?: string) => {
        setLoadingEvents(true);
        try {
            const fetched = await aurixAPI.getEvents({ limit: 1000, workflow_id: workflowFilter });
            setEvents(fetched);
        } catch (e) { console.error(e); } finally { setLoadingEvents(false); }
    };

    const getSeverityColor = (severity: string) => {
        const m: Record<string, string> = {
            LOW: "bg-green-500/15 text-green-400 border-green-500/20",
            MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/20",
            HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/20",
            CRITICAL: "bg-red-500/15 text-red-400 border-red-500/20",
        };
        return m[severity] || "bg-[#333] text-[#aaa] border-[#444]";
    };

    const getIssueForWorkflow = (wfId: string) => data?.top_issues.find(i => i.affected_workflow === wfId);

    const groupedEvents = events.reduce((acc, e) => {
        const w = e.workflow_id ?? "unknown";
        if (!acc[w]) acc[w] = [];
        acc[w].push(e);
        return acc;
    }, {} as Record<string, LLMEvent[]>);

    const workflows = Object.keys(groupedEvents);
    const allWorkflows = data?.workflow_breakdown.map(w => w.workflow_id) ?? [];
    const currentWorkflow = selectedWorkflow || workflows[0];
    const currentEvents = currentWorkflow ? (groupedEvents[currentWorkflow] || []) : [];
    const currentIssue = currentWorkflow ? getIssueForWorkflow(currentWorkflow) : undefined;
    const totalPages = Math.ceil(currentEvents.length / 25);
    const paginatedEvents = currentEvents.slice((currentPage - 1) * 25, currentPage * 25);

    useEffect(() => {
        if (allWorkflows.length > 0) {
            if (!compareWorkflowA) setCompareWorkflowA(allWorkflows[0]);
            if (!compareWorkflowB) setCompareWorkflowB(allWorkflows[1] || allWorkflows[0]);
        }
    }, [allWorkflows, compareWorkflowA, compareWorkflowB]);

    useEffect(() => { setCurrentPage(1); }, [currentWorkflow]);

    const openCopilot = (issue: Issue) => { setCopilotIssue(issue); setCopilotOpen(true); };

    const handleViewIssueInData = (issue: Issue) => {
        if (issue.affected_workflow) setSelectedWorkflow(issue.affected_workflow);
        setActiveTab("data"); setExpandedEventId(null);
    };

    const resetAudit = () => {
        setData(null); setError(null); setEvents([]); setExpandedEventId(null);
        setCopilotOpen(false); setCopilotIssue(null); setCurrentPage(1);
        setCompareWorkflowA(""); setCompareWorkflowB("");
    };

    // ─── Upload / Analyzing / Error States ──────────────────────────────────

    if (!data && !analyzing) {
        return (
            <div className="min-h-screen bg-[#111111] flex flex-col">
                {/* Top bar */}
                <div className="h-12 border-b border-[#222] bg-[#111] flex items-center px-5 gap-4 shrink-0">
                    <span className="font-display font-bold text-sm tracking-wider text-white">AUREX</span>
                    <span className="text-[#444] text-sm">|</span>
                    <span className="text-[11px] text-[#666]">LLM Audit · Cost Intelligence</span>
                    <div className="ml-auto flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#888]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                        </span>
                        <span className="text-[10px] font-mono text-[#555]">
                            {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                        </span>
                    </div>
                </div>
                {/* Content */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-2xl space-y-4">
                        {error && (
                            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 flex items-start gap-3">
                                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[12px] font-semibold text-red-300">Analysis failed</p>
                                    <p className="text-[11px] text-red-400/80 mt-1">{error}</p>
                                    <button onClick={resetAudit} className="mt-3 text-[11px] text-white/60 hover:text-white border border-[#333] rounded-lg px-3 py-1.5 transition-colors">Try again</button>
                                </div>
                            </div>
                        )}
                        <UploadZone
                            onFileSelect={handleFileSelect}
                            initialFile={pendingFile}
                            initialIsOtpStep={authRequired}
                            initialUserInfo={pendingUserInfo}
                            otpNotice={authRequiredMessage}
                            onResetPending={() => { setPendingFile(null); setPendingUserInfo(null); setAuthRequired(false); setAuthRequiredMessage(null); }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (analyzing) {
        return (
            <div className="min-h-screen bg-[#111111] flex items-center justify-center">
                <div className="w-full max-w-lg rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-8 space-y-6">
                    <div className="text-center">
                        <div className="mx-auto h-14 w-14 rounded-full border border-violet-500/30 bg-violet-500/10 flex items-center justify-center mb-4">
                            <Zap className="h-7 w-7 text-violet-400 animate-pulse" />
                        </div>
                        <h2 className="font-display text-lg font-bold text-white">Analyzing your file</h2>
                        <p className="text-[12px] text-[#666] mt-1">{Math.round(progress)}% complete</p>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#2a2a2a]">
                        <div className="h-1.5 rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {progressSteps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2">
                                {i === progressSteps.length - 1 && progress < 100
                                    ? <div className="h-3.5 w-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                }
                                <span className={`text-[11px] font-mono ${i === progressSteps.length - 1 && progress < 100 ? "text-violet-300" : "text-[#666]"}`}>{step}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#555] border-t border-[#222] pt-4">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Runs via your API — nothing leaves your machine in dev.</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;

    // ─── Main Dashboard Layout ───────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#111111] text-white flex flex-col">
            {/* ── Top Header Bar ──────────────────────────────────────────── */}
            <header className="h-14 border-b border-[#222] bg-[#111] flex items-center px-6 gap-5 shrink-0 z-30">
                <span className="font-display font-bold text-base tracking-wider text-white">AUREX</span>
                <span className="text-[#333] text-sm">|</span>
                <span className="text-[12px] text-[#555]">LLM Audit · Cost Intelligence</span>
                <div className="ml-auto flex items-center gap-4">
                    <span className="flex items-center gap-2 text-[11px] font-mono text-[#888]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                    <span className="text-[11px] font-mono text-[#555] hidden sm:block">
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                    <a href="/docs">
                        <Button className="h-8 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-white border border-[#333] text-[12px] font-medium px-4 rounded-md flex items-center gap-2">
                            <ExternalLink className="h-3.5 w-3.5" /> Connect SDK
                        </Button>
                    </a>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Left Sidebar ─────────────────────────────────────────── */}
                <aside className="w-56 shrink-0 border-r border-[#1e1e1e] bg-[#111] flex flex-col overflow-y-auto">
                    <nav className="flex-1 py-5 space-y-6">
                        {NAV_GROUPS.map(group => (
                            <div key={group.label}>
                                <p className="px-4 mb-2 text-[10px] font-mono font-semibold tracking-[0.15em] text-[#444] uppercase">
                                    {group.label}
                                </p>
                                <div className="space-y-0.5">
                                    {group.items.map(item => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setActiveTab(item.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-[13px] ${
                                                    isActive
                                                        ? "bg-[#1e1e1e] text-white"
                                                        : "text-[#666] hover:text-[#aaa] hover:bg-[#181818]"
                                                    }`}
                                            >
                                                <div className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                                    isActive ? "border-[#555] bg-[#333]" : "border-[#333] bg-transparent"
                                                }`}>
                                                    {isActive && <div className="h-2 w-2 rounded-sm bg-white/80" />}
                                                </div>
                                                <span className="flex-1 font-medium">{item.label}</span>
                                                {"badge" in item && item.badge && data.top_issues.length > 0 && (
                                                    <span className="ml-auto text-[10px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">
                                                        {data.top_issues.length}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {/* Bottom: Reset */}
                    <div className="border-t border-[#1e1e1e] p-3">
                        <button
                            type="button"
                            onClick={() => { aurixAPI.trackClick("analyze_another_file_click", userEmail || undefined); resetAudit(); }}
                            className="w-full text-[11px] text-[#555] hover:text-[#888] transition-colors py-1.5 text-left px-1"
                        >
                            ← New audit
                        </button>
                    </div>
                </aside>

                {/* ── Main Content ─────────────────────────────────────────── */}
                <main className="flex-1 overflow-y-auto">
                    {/* Tab Content */}
                    <div className="p-6">
                        <AnimatePresence mode="wait">
                            {activeTab === "overview" && (
                                <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                                    <OverviewTab
                                        data={data}
                                        getSeverityColor={getSeverityColor}
                                        onViewInData={handleViewIssueInData}
                                        onOpenCopilot={openCopilot}
                                        resetAudit={resetAudit}
                                    />
                                </motion.div>
                            )}

                            {activeTab === "data" && (
                                <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="font-display text-base font-bold text-white">Trace Workspace</h2>
                                            <p className="text-[11px] text-[#555] font-mono mt-0.5">
                                                {loadingEvents ? "Loading..." : `${events.length} spans · ${workflows.length} sessions`}
                                            </p>
                                        </div>
                                        <button onClick={handleExportCSV} disabled={events.length === 0} className="flex items-center gap-1.5 text-[11px] text-[#666] hover:text-white border border-[#2a2a2a] rounded-lg px-3 py-1.5 transition-all hover:border-[#444] disabled:opacity-40">
                                            <Download className="h-3.5 w-3.5" /> Export CSV
                                        </button>
                                    </div>

                                    {loadingEvents ? (
                                        <div className="py-16 text-center rounded-xl border border-[#2a2a2a]">
                                            <Zap className="mx-auto h-8 w-8 text-violet-400 animate-pulse mb-3" />
                                            <p className="text-[11px] text-[#555] font-mono">Fetching trace pipelines...</p>
                                        </div>
                                    ) : (
                                        <div className="grid lg:grid-cols-12 gap-4">
                                            {/* Sidebar */}
                                            <div className="lg:col-span-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3 space-y-3">
                                                <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-[#555] px-1">Sessions</p>
                                                <input
                                                    type="text" placeholder="Filter workflow..."
                                                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-[11px] text-white placeholder-[#444] focus:outline-none focus:border-[#444] font-mono transition-colors"
                                                />
                                                <div className="space-y-1 max-h-[560px] overflow-y-auto">
                                                    {workflows.filter(w => w.toLowerCase().includes(searchTerm.toLowerCase())).map(wf => {
                                                        const issue = getIssueForWorkflow(wf);
                                                        const isActive = wf === currentWorkflow;
                                                        const wb = data.workflow_breakdown.find(b => b.workflow_id === wf);
                                                        return (
                                                            <button key={wf} type="button"
                                                                onClick={() => { setSelectedWorkflow(wf); setExpandedEventId(null); }}
                                                                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-lg border transition-all text-[11px] ${isActive ? "bg-[#222] border-[#444] text-white" : "bg-transparent border-transparent text-[#666] hover:bg-[#1e1e1e] hover:text-[#aaa]"}`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="font-mono font-semibold truncate">{wf === "unknown" ? "Unlabeled" : wf}</p>
                                                                    <p className="text-[9px] text-[#555] mt-0.5">{wb?.request_count ?? 0} spans</p>
                                                                </div>
                                                                <div className="shrink-0 text-right">
                                                                    <p className="font-mono font-bold text-emerald-400">${(wb?.total_cost ?? 0).toFixed(3)}</p>
                                                                    {issue && <span className="text-[9px] text-red-400">● alert</span>}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Right panel */}
                                            <div className="lg:col-span-8 space-y-4">
                                                {/* Metric strip */}
                                                {(() => {
                                                    const wb = data.workflow_breakdown.find(b => b.workflow_id === currentWorkflow);
                                                    return (
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {[
                                                                { l: "Cost / Session", v: `$${(wb?.total_cost ?? 0).toFixed(4)}`, c: "text-emerald-400" },
                                                                { l: "Spans", v: `${wb?.request_count ?? 0}`, c: "text-white" },
                                                                { l: "Tokens", v: (wb?.total_tokens ?? 0).toLocaleString(), c: "text-indigo-300" },
                                                                { l: "Cost / Span", v: `$${(wb?.cost_per_request ?? 0).toFixed(4)}`, c: "text-white" },
                                                            ].map(m => (
                                                                <div key={m.l} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                                                                    <p className="text-[9px] font-mono text-[#555] uppercase tracking-wider">{m.l}</p>
                                                                    <p className={`text-sm font-mono font-bold mt-1 ${m.c}`}>{m.v}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Issue banner */}
                                                {currentIssue && (
                                                    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 relative overflow-hidden">
                                                        <div className="absolute left-0 top-0 w-1 h-full bg-red-500/60" />
                                                        <div className="flex items-start justify-between gap-4 pl-2">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="text-[12px] font-semibold text-red-200">{currentIssue.title}</p>
                                                                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${getSeverityColor(currentIssue.severity)}`}>{currentIssue.severity}</span>
                                                                </div>
                                                                <p className="text-[11px] text-[#888] mt-1.5 leading-relaxed">{currentIssue.one_line_summary}</p>
                                                                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#333]">
                                                                    <div><p className="text-[9px] font-mono text-[#555]">Weekly Waste</p><p className="font-mono text-sm font-bold text-red-400">${currentIssue.weekly_cost.toFixed(2)}</p></div>
                                                                    <div><p className="text-[9px] font-mono text-[#555]">Annual Savings</p><p className="font-mono text-sm font-bold text-emerald-400">${(currentIssue.weekly_cost * 52).toLocaleString()}</p></div>
                                                                </div>
                                                            </div>
                                                            <Button onClick={() => openCopilot(currentIssue)} className="bg-violet-600 hover:bg-violet-500 text-[11px] font-mono shrink-0 h-8 px-3 rounded-lg">
                                                                <Zap className="h-3 w-3 mr-1" /> Fix
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Spans */}
                                                <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
                                                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
                                                        <p className="text-[11px] font-mono font-semibold text-[#666] uppercase tracking-wider flex items-center gap-1.5">
                                                            <Sliders className="h-3.5 w-3.5 text-violet-400/70" /> Execution Spans
                                                        </p>
                                                        <span className="text-[10px] bg-[#222] border border-[#333] px-2 py-0.5 rounded text-[#666] font-mono">{currentEvents.length} spans</span>
                                                    </div>
                                                    <div className="divide-y divide-[#1e1e1e]">
                                                        {paginatedEvents.map((event, idx) => {
                                                            const hasIssue = !!currentIssue;
                                                            const isHighCost = event.cost > 0.01;
                                                            const isExpanded = expandedEventId === event.id;
                                                            const latency = event.extra_metadata?.latency_ms || event.extra_metadata?.duration_ms || 0;
                                                            const maxL = Math.max(...currentEvents.map(e => Number(e.extra_metadata?.latency_ms || 0)), 1);
                                                            const barPct = latency ? Math.max(6, (latency / maxL) * 100) : 0;
                                                            return (
                                                                <div key={event.id} className="overflow-hidden">
                                                                    <div
                                                                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                                                                        className={`flex items-center justify-between p-3 cursor-pointer gap-4 hover:bg-[#1e1e1e] transition-colors ${isExpanded ? "bg-[#1c1c1c]" : ""}`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            <span className="text-[9px] font-mono text-[#444] w-5 text-right shrink-0">{(currentPage - 1) * 25 + idx + 1}</span>
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="font-mono text-[11px] font-semibold text-[#ccc]">
                                                                                        {event.provider?.toUpperCase() || "LLM"} Call
                                                                                    </span>
                                                                                    <span className="text-[9px] font-mono bg-[#222] border border-[#333] px-1.5 py-0.5 rounded text-[#666]">{event.model}</span>
                                                                                    {latency > 0 && <span className="text-[10px] font-mono text-violet-400">{latency.toFixed(0)}ms</span>}
                                                                                </div>
                                                                                {latency > 0 && (
                                                                                    <div className="w-32 h-1 rounded-full bg-[#222] mt-1.5 hidden sm:block overflow-hidden">
                                                                                        <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${barPct}%` }} />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            <span className="text-[10px] font-mono text-[#555]">{event.input_tokens}→{event.output_tokens}</span>
                                                                            <span className="font-mono text-[11px] font-bold text-emerald-400">${event.cost.toFixed(4)}</span>
                                                                            {hasIssue && isHighCost
                                                                                ? <span className="text-[9px] font-mono bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">waste</span>
                                                                                : hasIssue ? <span className="text-[9px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">warn</span>
                                                                                    : <span className="text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">ok</span>
                                                                            }
                                                                            {isExpanded ? <ChevronDown className="h-4 w-4 text-violet-400" /> : <ChevronRight className="h-4 w-4 text-[#444]" />}
                                                                        </div>
                                                                    </div>
                                                                    {isExpanded && <PromptDiffPanel event={event} issue={currentIssue} />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {/* Pagination */}
                                                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#222] bg-[#111]">
                                                        <p className="text-[10px] font-mono text-[#555]">
                                                            {Math.min(currentEvents.length, (currentPage - 1) * 25 + 1)}–{Math.min(currentEvents.length, currentPage * 25)} of {currentEvents.length}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="text-[10px] font-mono text-[#555] hover:text-white border border-[#2a2a2a] px-2 py-1 rounded disabled:opacity-30 transition-colors">Prev</button>
                                                            <span className="text-[10px] font-mono text-[#555]">{currentPage}/{totalPages || 1}</span>
                                                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="text-[10px] font-mono text-[#555] hover:text-white border border-[#2a2a2a] px-2 py-1 rounded disabled:opacity-30 transition-colors">Next</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {activeTab === "compare" && (
                                <motion.div key="compare" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                                    <div>
                                        <h2 className="font-display text-base font-bold text-white">Pipeline Comparison</h2>
                                        <p className="text-[11px] text-[#555] font-mono mt-0.5">Compare cost, load, and model performance side-by-side.</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {[{ label: "Pipeline A", val: compareWorkflowA, set: setCompareWorkflowA }, { label: "Pipeline B", val: compareWorkflowB, set: setCompareWorkflowB }].map(sel => (
                                            <div key={sel.label} className="space-y-1.5">
                                                <label className="text-[9px] font-mono uppercase tracking-wider text-[#555]">{sel.label}</label>
                                                <select value={sel.val} onChange={e => sel.set(e.target.value)}
                                                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-[11px] text-white focus:outline-none focus:border-[#444] font-mono transition-colors">
                                                    {allWorkflows.map(w => <option key={w} value={w} className="bg-[#1a1a1a]">{w === "unknown" ? "Unlabeled Workflow" : w}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    {(() => {
                                        const wA = data.workflow_breakdown.find(w => w.workflow_id === compareWorkflowA) || data.workflow_breakdown[0];
                                        const wB = data.workflow_breakdown.find(w => w.workflow_id === compareWorkflowB) || data.workflow_breakdown[1] || data.workflow_breakdown[0];
                                        if (!wA || !wB) return null;
                                        const costDiff = wB.total_cost - wA.total_cost;
                                        const costDiffPct = wA.total_cost > 0 ? (costDiff / wA.total_cost) * 100 : 0;
                                        const issueA = getIssueForWorkflow(wA.workflow_id);
                                        const issueB = getIssueForWorkflow(wB.workflow_id);
                                        return (
                                            <div className="grid gap-4 md:grid-cols-2">
                                                {[{ w: wA, label: "Pipeline A", issue: issueA, color: "text-violet-400", badge: "Baseline" }, { w: wB, label: "Pipeline B", issue: issueB, color: "text-indigo-400", badge: "Target" }].map(({ w, label, issue, color, badge }) => (
                                                    <div key={label} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 space-y-4">
                                                        <div className="flex justify-between items-start border-b border-[#222] pb-3">
                                                            <div>
                                                                <p className="text-[9px] font-mono text-[#555]">{label}</p>
                                                                <p className={`text-[12px] font-bold font-mono truncate max-w-[180px] mt-0.5 ${color}`}>{w.workflow_id === "unknown" ? "Unlabeled" : w.workflow_id}</p>
                                                            </div>
                                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${color === "text-violet-400" ? "bg-violet-500/10 border-violet-500/20 text-violet-300" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"}`}>{badge}</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {[
                                                                { l: "Total Spend", v: `$${w.total_cost.toFixed(2)}` },
                                                                { l: "Requests", v: `${w.request_count.toLocaleString()}` },
                                                                { l: "Cost/Span", v: `$${w.cost_per_request.toFixed(4)}` },
                                                                { l: "Total Tokens", v: w.total_tokens.toLocaleString() },
                                                            ].map(m => (
                                                                <div key={m.l} className="rounded-lg border border-[#222] bg-[#141414] p-3">
                                                                    <p className="text-[9px] font-mono text-[#555]">{m.l}</p>
                                                                    <p className="font-mono text-sm font-bold text-white mt-1">{m.v}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {issue ? (
                                                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-start gap-2">
                                                                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                                                                <div>
                                                                    <p className="text-[10px] font-semibold text-red-300">Active waste signal</p>
                                                                    <p className="text-[10px] text-[#888] mt-0.5">{issue.title}</p>
                                                                    <button onClick={() => openCopilot(issue)} className="mt-2 text-[10px] font-mono bg-red-600/20 hover:bg-red-600 text-white border border-red-500/30 rounded px-2 py-1 transition-colors">Fix with agent</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                                                <p className="text-[10px] font-semibold text-emerald-300">No active inefficiencies</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </motion.div>
                            )}

                            {activeTab === "insights" && (
                                <motion.div key="insights" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                                    <AgentPlanPanel
                                        issues={data.top_issues}
                                        getSeverityClass={getSeverityColor}
                                        onOpenCopilot={openCopilot}
                                        onViewInData={handleViewIssueInData}
                                    />
                                </motion.div>
                            )}

                            {activeTab === "savings" && (
                                <motion.div key="savings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                                    <SavingsPanel companyName={companyName || "Aurex Corp"} />
                                </motion.div>
                            )}

                            {activeTab === "settings" && (
                                <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                                    <SettingsPanel companyName={companyName || "Aurex Corp"} onRefreshAnalysis={handleRefreshAnalysis} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>

            <AuditCopilotDock
                open={copilotOpen}
                issue={copilotIssue}
                userEmail={userEmail}
                onClose={() => { setCopilotOpen(false); setCopilotIssue(null); }}
            />
        </div>
    );
}
