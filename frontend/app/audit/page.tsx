"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { UploadZone } from "@/components/audit/upload-zone";
import { AgentPlanPanel } from "@/components/audit/agent-plan-panel";
import { SettingsPanel } from "@/components/audit/settings-panel";
import { SavingsPanel } from "@/components/audit/savings-panel";
import { AuditCopilotDock } from "@/components/audit/audit-copilot-dock";
import { FeedbackDialog } from "@/components/audit/feedback-dialog";
import { ScoreGateStep } from "@/components/audit/score-gate-step";
import { aurexAPI, ExecutiveSummary, Issue, LLMEvent } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Loader2,
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
        <div className="grid gap-4 border-t border-border bg-background p-5 md:grid-cols-2">
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
        <div className="rounded-xl border border-border bg-surface p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground mb-2">Connect SDK to get live data from your production environment</p>
                <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
                    <SquareTerminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <code className="text-[11px] font-mono text-foreground/80 truncate">{snippet}</code>
                    <button onClick={copy} className="ml-auto shrink-0 text-muted-foreground hover:text-muted-foreground transition-colors">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <Button className="shrink-0 bg-border hover:bg-accent text-white border border-border text-[11px] font-medium px-4 h-9 rounded-lg">
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
                    <div key={kpi.label} className="rounded-xl border border-border bg-surface p-5">
                        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</p>
                        <div className="flex items-baseline gap-1.5 mt-2.5">
                            <p className={`text-3xl font-display font-bold tabular-nums leading-none ${kpi.valueColor}`}>{kpi.value}</p>
                            {kpi.valueSuffix && <span className="text-base font-mono text-muted-foreground">{kpi.valueSuffix}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                            {kpi.delta && (
                                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${kpi.deltaPos ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                    {kpi.delta}
                                </span>
                            )}
                            <span className="text-[12px] text-muted-foreground">{kpi.sub}</span>
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
                <div className="lg:col-span-3 rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                        <div className="flex items-center gap-2.5">
                            <div className="h-4 w-4 rounded border border-border bg-border" />
                            <span className="text-[14px] font-semibold text-white">Top inefficiencies</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { }}
                            className="text-[12px] text-muted-foreground hover:text-muted-foreground transition-colors flex items-center gap-1"
                        >
                            View all <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="divide-y divide-border">
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
                                    className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-muted transition-colors group"
                                >
                                    <span className="text-[11px] font-mono text-muted-foreground pt-0.5 w-6 shrink-0">#{issue.rank}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-semibold text-foreground group-hover:text-white transition-colors leading-tight">
                                            {issue.title}
                                        </p>
                                        <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
                                            {issue.one_line_summary}
                                        </p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${sevClass}`}>
                                            {sev}
                                        </span>
                                        <span className="text-[12px] font-mono font-bold text-red-400">
                                            −${issue.weekly_cost.toFixed(2)}<span className="text-muted-foreground font-normal">/wk</span>
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
                    <div className="rounded-xl border border-border bg-surface p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="h-4 w-4 rounded border border-border bg-border" />
                            <span className="text-[14px] font-semibold text-white">Model breakdown</span>
                        </div>
                        <div className="space-y-3.5">
                            {modelEntries.length > 0 ? modelEntries.map(([model, stats]) => {
                                const pct = totalModelCost > 0 ? Math.round((stats.cost / totalModelCost) * 100) : 0;
                                const barWidth = `${pct}%`;
                                return (
                                    <div key={model} className="flex items-center gap-3">
                                        <div className="w-20 shrink-0">
                                            <p className="text-[12px] font-mono text-foreground/80 truncate">{model}</p>
                                        </div>
                                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-muted-foreground"
                                                style={{ width: barWidth }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[12px] font-mono text-foreground/80">${stats.cost.toFixed(2)}</span>
                                            <span className="text-[11px] text-muted-foreground w-8 text-right">{pct}%</span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-[12px] text-muted-foreground font-mono">No model data available</p>
                            )}
                        </div>
                    </div>

                    {/* Cost per Outcome */}
                    <div className="rounded-xl border border-border bg-surface p-5">
                        <span className="text-[14px] font-semibold text-white block mb-4">Cost per outcome</span>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
                                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Current</p>
                                <p className="text-xl font-display font-bold text-white mt-1.5 tabular-nums">
                                    ${data.executive_summary.cost_per_outcome_current?.toFixed(2) ?? (data.executive_summary.current_period_spend / Math.max(1, data.total_events)).toFixed(2)}
                                </p>
                            </div>
                            <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
                                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Optimized</p>
                                <p className="text-xl font-display font-bold text-emerald-400 mt-1.5 tabular-nums">
                                    ${data.executive_summary.cost_per_outcome_optimized?.toFixed(2) ?? (data.executive_summary.optimized_spend / Math.max(1, data.total_events)).toFixed(2)}
                                </p>
                            </div>
                            <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
                                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Waste Rate</p>
                                <p className="text-xl font-display font-bold text-white mt-1.5 tabular-nums">
                                    {(100 - data.executive_summary.waste_percentage).toFixed(0)}%
                                </p>
                            </div>
                            <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
                                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Workflows</p>
                                <p className="text-xl font-display font-bold text-amber-400 mt-1.5 tabular-nums">
                                    {data.workflow_breakdown.length}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Workflow Spend Table */}
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <div className="h-4 w-4 rounded border border-border bg-border" />
                        <span className="text-[14px] font-semibold text-white">
                            Workflow spend · {data.executive_summary.period_days}d
                        </span>
                    </div>
                    <button className="text-[12px] text-muted-foreground hover:text-muted-foreground transition-colors flex items-center gap-1.5">
                        Export <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="divide-y divide-border">
                    {data.workflow_breakdown.slice(0, 6).map(wf => {
                        const status = getWorkflowStatus(wf.workflow_id);
                        const displayName = wf.workflow_id === "unknown"
                            ? "Unlabeled Workflow"
                            : wf.workflow_id.startsWith("inferred_session_")
                                ? "Inferred Session"
                                : wf.workflow_id;
                        return (
                            <div key={wf.workflow_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted transition-colors">
                                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${status.dot}`} />
                                <span className="text-[13px] font-mono text-foreground/80 flex-1 truncate min-w-0">{displayName}</span>
                                <span className="text-[12px] text-muted-foreground shrink-0">{wf.request_count.toLocaleString()} calls</span>
                                <span className="text-[13px] font-mono font-semibold text-foreground shrink-0">${wf.total_cost.toFixed(2)}</span>
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
    const router = useRouter();
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
    const [isReportView, setIsReportView] = useState(false);
    const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
    const [feedbackLabel, setFeedbackLabel] = useState("We really need your feedback!");
    const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const checkFeedbackPrompt = async (email: string) => {
        try {
            const history = await aurexAPI.getAuditHistory(email, 0, 1);
            const total = history.total || 0;
            if (total >= 5 && (total - 5) % 4 === 0) {
                const shownStr = localStorage.getItem("aurex_feedback_shown_sessions") || "[]";
                const shown: number[] = JSON.parse(shownStr);
                if (!shown.includes(total)) {
                    setFeedbackLabel("We are constantly improving Aurex to deliver top-tier cost savings and we really need your feedback!");
                    setShowFeedbackDialog(true);
                    shown.push(total);
                    localStorage.setItem("aurex_feedback_shown_sessions", JSON.stringify(shown));
                }
            }
        } catch (err) {
            console.error("Error checking feedback prompt history:", err);
        }
    };

    useEffect(() => {
        const userInfo = aurexAPI.getUserInfo();
        if (userInfo) {
            setCompanyName(userInfo.company_name);
            setUserEmail(userInfo.email);
            checkFeedbackPrompt(userInfo.email);
        }
        return () => {
            if (feedbackTimeoutRef.current) {
                clearTimeout(feedbackTimeoutRef.current);
            }
        };
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
            aurexAPI.setToken(token);
            const info = { user_name: oauthUserName || oauthEmail.split('@')[0], email: oauthEmail, company_name: oauthCompanyName || '' };
            aurexAPI.setUserInfo(info);
            setUserEmail(oauthEmail);
            setCompanyName(oauthCompanyName || '');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('session_id') || params.get('sessionId');
        if (sid) {
            setIsReportView(true);
            async function loadSession() {
                setAnalyzing(true);
                setProgress(20);
                setProgressSteps(["Locating past audit run...", "Retrieving executive analysis summary..."]);
                try {
                    const session = await aurexAPI.getAuditSession(sid!);
                    setProgress(70);
                    setProgressSteps(prev => [...prev, "Extracting performance recommendations..."]);
                    if (session && (session as any).analysis_results) {
                        setSessionId(session.id);
                        setData((session as any).analysis_results);
                        setLoadingEvents(true);
                        try {
                            const fetched = await aurexAPI.getEvents({ limit: 1000, session_id: session.id });
                            setEvents(fetched);
                        } catch (e) {
                            console.error("Failed to load events for session", e);
                        } finally {
                            setLoadingEvents(false);
                        }
                    } else {
                        setError("This audit run does not contain any saved analysis results.");
                    }
                } catch (err: any) {
                    console.error("Failed to fetch session", err);
                    setError(err?.message || "Failed to load the requested audit session.");
                } finally {
                    setAnalyzing(false);
                }
            }
            void loadSession();
        }
    }, []);

    const handleRefreshAnalysis = async () => {
        const activeEmail = userEmail || aurexAPI.getUserInfo()?.email;
        if (!activeEmail) return;
        setAnalyzing(true);
        setProgress(0);
        setProgressSteps(["Querying updated pricing overrides...", "Recalculating event costs...", "Regenerating executive summary..."]);
        try {
            const summary = await aurexAPI.getExecutiveSummary(activeEmail);
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
        const activeEmail = userEmail || aurexAPI.getUserInfo()?.email;
        if (!activeSessionId && activeEmail) {
            try {
                const history = await aurexAPI.getAuditHistory(activeEmail, 0, 1);
                if (history.sessions?.length > 0) activeSessionId = history.sessions[0].id;
            } catch (err) { console.error(err); }
        }
        if (!activeSessionId) { alert("No audit session found. Please perform an audit first."); return; }
        try {
            const blob = await aurexAPI.downloadExecutiveReport(activeSessionId);
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
            const { session, summary } = await aurexAPI.completeAudit(file, userInfo);
            setSessionId(session.id);
            clearInterval(iv);
            setProgressSteps(prev => [...prev, "Finalizing analysis..."]);
            setProgress(100);
            await new Promise(r => setTimeout(r, 500));
            setData(summary);
            setPendingFile(null); setPendingUserInfo(null); setAuthRequired(false); setAuthRequiredMessage(null);
            
            // Show the feedback dialog with a 3-minute delay (180,000 ms) to give the user time to inspect the dashboard
            feedbackTimeoutRef.current = setTimeout(() => {
                setFeedbackLabel("Analysis completed successfully!");
                setShowFeedbackDialog(true);
            }, 3 * 60 * 1000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Upload failed";
            clearInterval(iv);
            const isAuth = ["verification", "authenticate", "authorized", "403", "401"].some(k => message.toLowerCase().includes(k));
            if (isAuth) {
                aurexAPI.clearSession();
                setPendingFile(file); setPendingUserInfo(userInfo); setAuthRequired(true);
                setAuthRequiredMessage("Your session expired. Please enter the new 6-digit verification code sent to your email.");
                try { await aurexAPI.requestOTP(userInfo.email); } catch { }
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
            const fetched = await aurexAPI.getEvents({ 
                limit: 1000, 
                workflow_id: workflowFilter,
                session_id: sessionId || undefined
            });
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
        return m[severity] || "bg-accent text-muted-foreground border-border";
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
        if (isReportView) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center p-8 text-white">
                    <div className="w-full max-w-md space-y-4">
                        {error ? (
                            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-6 space-y-4 text-center">
                                <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                                    <AlertCircle className="h-5 w-5 text-red-400" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-red-300">Failed to load report</p>
                                    <p className="text-xs text-red-400/80 font-mono mt-1 max-h-32 overflow-y-auto pr-1">{error}</p>
                                </div>
                                <Button 
                                    onClick={() => router.push('/app/profile')}
                                    className="bg-white hover:bg-white/90 text-black text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                                >
                                    Back to Profile
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center space-y-3.5">
                                <Loader2 className="w-8 h-8 animate-spin text-white/30 mx-auto" />
                                <p className="text-xs text-white/40 font-mono">Retrieving saved cost audit report...</p>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-background flex flex-col">
                {/* Top bar */}
                <div className="h-12 border-b border-border bg-background flex items-center px-5 gap-4 shrink-0">
                    <a href="/" className="font-serif uppercase tracking-[0.2em] font-medium text-white">AUREX</a>
                    <span className="text-muted-foreground text-sm">|</span>
                    <span className="text-[11px] text-muted-foreground">LLM Audit · Cost Intelligence</span>
                    <div className="ml-auto flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
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
                                    <button onClick={resetAudit} className="mt-3 text-[11px] text-white/60 hover:text-white border border-border rounded-lg px-3 py-1.5 transition-colors">Try again</button>
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
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 space-y-6">
                    <div className="text-center">
                        <div className="mx-auto h-14 w-14 rounded-full border border-teal-500/30 bg-teal-500/10 flex items-center justify-center mb-4">
                            <Zap className="h-7 w-7 text-teal-400 animate-pulse" />
                        </div>
                        <h2 className="font-display text-lg font-bold text-white">Analyzing your file</h2>
                        <p className="text-[12px] text-muted-foreground mt-1">{Math.round(progress)}% complete</p>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-border">
                        <div className="h-1.5 rounded-full bg-teal-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {progressSteps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2">
                                {i === progressSteps.length - 1 && progress < 100
                                    ? <div className="h-3.5 w-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                }
                                <span className={`text-[11px] font-mono ${i === progressSteps.length - 1 && progress < 100 ? "text-teal-300" : "text-muted-foreground"}`}>{step}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground border-t border-border pt-4">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Runs via your API — nothing leaves your machine in dev.</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const isGated = userEmail?.startsWith('anon-');

    if (isGated) {
        return (
            <ScoreGateStep 
                data={data}
                onUnlock={(email, company) => {
                    const userInfo = {
                        user_name: email.split('@')[0],
                        email: email,
                        company_name: company
                    };
                    aurexAPI.setUserInfo(userInfo);
                    setUserEmail(email);
                    setCompanyName(company);
                }}
            />
        );
    }

    // ─── Main Dashboard Layout ───────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-background text-white flex flex-col">
            {/* ── Top Header Bar ──────────────────────────────────────────── */}
            <header className="h-14 border-b border-border bg-background flex items-center px-6 gap-5 shrink-0 z-30">
                <button onClick={() => router.push('/')} className="font-display font-bold text-base tracking-wider text-white hover:text-muted-foreground transition-colors cursor-pointer">AUREX</button>
                <span className="text-accent text-sm">|</span>
                <span className="text-[12px] text-muted-foreground">LLM Audit · Cost Intelligence</span>
                <div className="ml-auto flex items-center gap-4">
                    <span className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground hidden sm:block">
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                    <a href="/docs" className="h-8 bg-surface-raised hover:bg-border text-white border border-border text-[12px] font-medium px-4 rounded-md flex items-center gap-2 no-underline">
                        <ExternalLink className="h-3.5 w-3.5" /> Connect SDK
                    </a>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Left Sidebar ─────────────────────────────────────────── */}
                <aside className="w-56 shrink-0 border-r border-surface-raised bg-background flex flex-col overflow-y-auto">
                    <nav className="flex-1 py-5 space-y-6">
                        {NAV_GROUPS.map(group => (
                            <div key={group.label}>
                                <p className="px-4 mb-2 text-[10px] font-mono font-semibold tracking-[0.15em] text-muted-foreground uppercase">
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
                                                        ? "bg-surface-raised text-white"
                                                        : "text-muted-foreground hover:text-muted-foreground hover:bg-surface"
                                                    }`}
                                            >
                                                <div className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                                    isActive ? "border-muted-foreground bg-accent" : "border-border bg-transparent"
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
                    <div className="border-t border-surface-raised p-3">
                        <button
                            type="button"
                            onClick={() => { aurexAPI.trackClick("analyze_another_file_click", userEmail || undefined); resetAudit(); }}
                            className="w-full text-[11px] text-muted-foreground hover:text-muted-foreground transition-colors py-1.5 text-left px-1"
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
                                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                                {loadingEvents ? "Loading..." : `${events.length} spans · ${workflows.length} sessions`}
                                            </p>
                                        </div>
                                        <button onClick={handleExportCSV} disabled={events.length === 0} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-white border border-border rounded-lg px-3 py-1.5 transition-all hover:border-border disabled:opacity-40">
                                            <Download className="h-3.5 w-3.5" /> Export CSV
                                        </button>
                                    </div>

                                    {loadingEvents ? (
                                        <div className="py-16 text-center rounded-xl border border-border">
                                            <Zap className="mx-auto h-8 w-8 text-teal-400 animate-pulse mb-3" />
                                            <p className="text-[11px] text-muted-foreground font-mono">Fetching trace pipelines...</p>
                                        </div>
                                    ) : (
                                        <div className="grid lg:grid-cols-12 gap-4">
                                            {/* Sidebar */}
                                            <div className="lg:col-span-4 rounded-xl border border-border bg-surface p-3 space-y-3">
                                                <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground px-1">Sessions</p>
                                                <input
                                                    type="text" placeholder="Filter workflow..."
                                                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-white placeholder-[#52525a] focus:outline-none focus:border-border font-mono transition-colors"
                                                />
                                                <div className="space-y-1 max-h-[560px] overflow-y-auto">
                                                    {workflows.filter(w => w.toLowerCase().includes(searchTerm.toLowerCase())).map(wf => {
                                                        const issue = getIssueForWorkflow(wf);
                                                        const isActive = wf === currentWorkflow;
                                                        const wb = data.workflow_breakdown.find(b => b.workflow_id === wf);
                                                        return (
                                                            <button key={wf} type="button"
                                                                onClick={() => { setSelectedWorkflow(wf); setExpandedEventId(null); }}
                                                                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-lg border transition-all text-[11px] ${isActive ? "bg-[#2e2e34] border-border text-white" : "bg-transparent border-transparent text-muted-foreground hover:bg-surface-raised hover:text-muted-foreground"}`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="font-mono font-semibold truncate">{wf === "unknown" ? "Unlabeled" : wf}</p>
                                                                    <p className="text-[9px] text-muted-foreground mt-0.5">{wb?.request_count ?? 0} spans</p>
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
                                                                { l: "Tokens", v: (wb?.total_tokens ?? 0).toLocaleString(), c: "text-teal-300" },
                                                                { l: "Cost / Span", v: `$${(wb?.cost_per_request ?? 0).toFixed(4)}`, c: "text-white" },
                                                            ].map(m => (
                                                                <div key={m.l} className="rounded-lg border border-border bg-surface p-3">
                                                                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{m.l}</p>
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
                                                                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{currentIssue.one_line_summary}</p>
                                                                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                                                                    <div><p className="text-[9px] font-mono text-muted-foreground">Weekly Waste</p><p className="font-mono text-sm font-bold text-red-400">${currentIssue.weekly_cost.toFixed(2)}</p></div>
                                                                    <div><p className="text-[9px] font-mono text-muted-foreground">Annual Savings</p><p className="font-mono text-sm font-bold text-emerald-400">${(currentIssue.weekly_cost * 52).toLocaleString()}</p></div>
                                                                </div>
                                                            </div>
                                                            <Button onClick={() => openCopilot(currentIssue)} className="bg-teal-600 hover:bg-teal-500 text-[11px] font-mono shrink-0 h-8 px-3 rounded-lg">
                                                                <Zap className="h-3 w-3 mr-1" /> Fix
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Spans */}
                                                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                                                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                                        <p className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                            <Sliders className="h-3.5 w-3.5 text-teal-400/70" /> Execution Spans
                                                        </p>
                                                        <span className="text-[10px] bg-[#2e2e34] border border-border px-2 py-0.5 rounded text-muted-foreground font-mono">{currentEvents.length} spans</span>
                                                    </div>
                                                    <div className="divide-y divide-surface-raised">
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
                                                                        className={`flex items-center justify-between p-3 cursor-pointer gap-4 hover:bg-surface-raised transition-colors ${isExpanded ? "bg-surface-raised" : ""}`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            <span className="text-[9px] font-mono text-muted-foreground w-5 text-right shrink-0">{(currentPage - 1) * 25 + idx + 1}</span>
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="font-mono text-[11px] font-semibold text-foreground/80">
                                                                                        {event.provider?.toUpperCase() || "LLM"} Call
                                                                                    </span>
                                                                                    <span className="text-[9px] font-mono bg-[#2e2e34] border border-border px-1.5 py-0.5 rounded text-muted-foreground">{event.model}</span>
                                                                                    {latency > 0 && <span className="text-[10px] font-mono text-teal-400">{latency.toFixed(0)}ms</span>}
                                                                                </div>
                                                                                {latency > 0 && (
                                                                                    <div className="w-32 h-1 rounded-full bg-[#2e2e34] mt-1.5 hidden sm:block overflow-hidden">
                                                                                        <div className="h-full rounded-full bg-teal-500/60" style={{ width: `${barPct}%` }} />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            <span className="text-[10px] font-mono text-muted-foreground">{event.input_tokens}→{event.output_tokens}</span>
                                                                            <span className="font-mono text-[11px] font-bold text-emerald-400">${event.cost.toFixed(4)}</span>
                                                                            {hasIssue && isHighCost
                                                                                ? <span className="text-[9px] font-mono bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">waste</span>
                                                                                : hasIssue ? <span className="text-[9px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">warn</span>
                                                                                    : <span className="text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">ok</span>
                                                                            }
                                                                            {isExpanded ? <ChevronDown className="h-4 w-4 text-teal-400" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                                        </div>
                                                                    </div>
                                                                    {isExpanded && <PromptDiffPanel event={event} issue={currentIssue} />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {/* Pagination */}
                                                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-background">
                                                        <p className="text-[10px] font-mono text-muted-foreground">
                                                            {Math.min(currentEvents.length, (currentPage - 1) * 25 + 1)}–{Math.min(currentEvents.length, currentPage * 25)} of {currentEvents.length}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="text-[10px] font-mono text-muted-foreground hover:text-white border border-border px-2 py-1 rounded disabled:opacity-30 transition-colors">Prev</button>
                                                            <span className="text-[10px] font-mono text-muted-foreground">{currentPage}/{totalPages || 1}</span>
                                                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="text-[10px] font-mono text-muted-foreground hover:text-white border border-border px-2 py-1 rounded disabled:opacity-30 transition-colors">Next</button>
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
                                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">Compare cost, load, and model performance side-by-side.</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {[{ label: "Pipeline A", val: compareWorkflowA, set: setCompareWorkflowA }, { label: "Pipeline B", val: compareWorkflowB, set: setCompareWorkflowB }].map(sel => (
                                            <div key={sel.label} className="space-y-1.5">
                                                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{sel.label}</label>
                                                <select value={sel.val} onChange={e => sel.set(e.target.value)}
                                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-white focus:outline-none focus:border-border font-mono transition-colors">
                                                    {allWorkflows.map(w => <option key={w} value={w} className="bg-surface">{w === "unknown" ? "Unlabeled Workflow" : w}</option>)}
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
                                                {[{ w: wA, label: "Pipeline A", issue: issueA, color: "text-teal-400", badge: "Baseline" }, { w: wB, label: "Pipeline B", issue: issueB, color: "text-teal-400", badge: "Target" }].map(({ w, label, issue, color, badge }) => (
                                                    <div key={label} className="rounded-xl border border-border bg-surface p-5 space-y-4">
                                                        <div className="flex justify-between items-start border-b border-border pb-3">
                                                            <div>
                                                                <p className="text-[9px] font-mono text-muted-foreground">{label}</p>
                                                                <p className={`text-[12px] font-bold font-mono truncate max-w-[180px] mt-0.5 ${color}`}>{w.workflow_id === "unknown" ? "Unlabeled" : w.workflow_id}</p>
                                                            </div>
                                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${color === "text-teal-400" ? "bg-teal-500/10 border-teal-500/20 text-teal-300" : "bg-teal-500/10 border-teal-500/20 text-teal-300"}`}>{badge}</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {[
                                                                { l: "Total Spend", v: `$${w.total_cost.toFixed(2)}` },
                                                                { l: "Requests", v: `${w.request_count.toLocaleString()}` },
                                                                { l: "Cost/Span", v: `$${w.cost_per_request.toFixed(4)}` },
                                                                { l: "Total Tokens", v: w.total_tokens.toLocaleString() },
                                                            ].map(m => (
                                                                <div key={m.l} className="rounded-lg border border-border bg-surface-sunken p-3">
                                                                    <p className="text-[9px] font-mono text-muted-foreground">{m.l}</p>
                                                                    <p className="font-mono text-sm font-bold text-white mt-1">{m.v}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {issue ? (
                                                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-start gap-2">
                                                                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                                                                <div>
                                                                    <p className="text-[10px] font-semibold text-red-300">Active waste signal</p>
                                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{issue.title}</p>
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
                                    <SavingsPanel
                                        companyName={companyName || pendingUserInfo?.company_name || ""}
                                        executiveSummary={data?.executive_summary}
                                        hasActiveSession={!!sessionId}
                                    />
                                </motion.div>
                            )}

                            {activeTab === "settings" && (
                                <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                                    <SettingsPanel
                                        companyName={companyName || pendingUserInfo?.company_name || ""}
                                        onRefreshAnalysis={handleRefreshAnalysis}
                                    />
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

            <FeedbackDialog
                isOpen={showFeedbackDialog}
                onClose={() => setShowFeedbackDialog(false)}
                label={feedbackLabel}
                userEmail={userEmail}
            />
        </div>
    );
}
