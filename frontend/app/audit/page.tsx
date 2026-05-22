"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { UploadZone } from "@/components/audit/upload-zone";
import { CreditScoreCard } from "@/components/audit/credit-score-card";
import { BentoMetricCard } from "@/components/audit/bento-metric-card";
import { AgentPlanPanel } from "@/components/audit/agent-plan-panel";
import { SettingsPanel } from "@/components/audit/settings-panel";
import { SavingsPanel } from "@/components/audit/savings-panel";
import { AuditCopilotDock } from "@/components/audit/audit-copilot-dock";
import { aurixAPI, ExecutiveSummary, Issue, LLMEvent } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    AlertCircle,
    TrendingUp,
    DollarSign,
    Zap,
    CheckCircle2,
    ShieldCheck,
    FileText,
    Download,
    AlertTriangle,
    Share2,
    X,
    ChevronDown,
    ChevronRight,
    BarChart3,
    ArrowLeft,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

function PromptDiffPanel({
    event,
    issue,
}: {
    event: LLMEvent;
    issue: Issue | undefined;
}) {
    const current =
        event.prompt?.trim() ||
        "(No prompt text in this export—many provider CSVs omit message bodies.)";
    const optimized = issue
        ? `${issue.cta ? `${issue.cta}\n\n` : ""}${issue.one_line_summary}`
        : "Route this workload to a smaller model when token count is low; cache static system text; dedupe repeated prefixes.";

    return (
        <div className="grid gap-6 border-t border-white/10 bg-black/40 p-6 md:grid-cols-2">
            <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Current · from log
                </p>
                <div className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/70">
                        {current}
                    </pre>
                </div>
            </div>
            <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                    Aurex optimized · suggested
                </p>
                <div className="max-h-48 overflow-auto rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-emerald-100/90">
                        {optimized}
                    </pre>
                </div>
            </div>
        </div>
    );
}

export default function AuditPage() {
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState<string[]>([]);
    const [data, setData] = useState<ExecutiveSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "data" | "compare" | "insights" | "savings" | "settings">("overview");
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

    useEffect(() => {
        const userInfo = aurixAPI.getUserInfo();
        if (userInfo) {
            setCompanyName(userInfo.company_name);
            setUserEmail(userInfo.email);
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
            // Also reload events if they are currently loaded
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
                if (history.sessions && history.sessions.length > 0) {
                    activeSessionId = history.sessions[0].id;
                }
            } catch (err) {
                console.error("Failed to load audit history for report download:", err);
            }
        }
        
        if (!activeSessionId) {
            alert("No audit session found to download. Please perform an audit first.");
            return;
        }
        
        try {
            const blob = await aurixAPI.downloadExecutiveReport(activeSessionId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `aurex-executive-report-${activeSessionId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to download PDF report:", err);
            alert("Failed to download PDF report. Please try again.");
        }
    };

    const simulateProgress = () => {
        const steps = [
            "Validating file format...",
            "Parsing data structure...",
            "Detecting duplicate prompts...",
            "Analyzing token usage patterns...",
            "Identifying cost inefficiencies...",
            "Checking for burst patterns...",
            "Evaluating model selection...",
            "Calculating optimization potential...",
            "Generating recommendations..."
        ];
        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep < steps.length) {
                setProgressSteps((prev) => [...prev, steps[currentStep]]);
                setProgress(((currentStep + 1) / (steps.length + 1)) * 100);
                currentStep++;
            } else {
                clearInterval(interval);
            }
        }, 300);
        return interval;
    };

    const handleFileSelect = async (
        file: File,
        userInfo: { user_name: string; email: string; company_name: string }
    ) => {
        setAnalyzing(true);
        setProgress(0);
        setProgressSteps([]);
        setError(null);
        setData(null);
        setEvents([]);
        setExpandedEventId(null);
        setCopilotOpen(false);
        setCopilotIssue(null);

        const progressInterval = simulateProgress();
        try {
            setUserEmail(userInfo.email);
            setCompanyName(userInfo.company_name);
            const { session, summary } = await aurixAPI.completeAudit(file, userInfo);
            setSessionId(session.id);
            clearInterval(progressInterval);
            setProgressSteps((prev) => [...prev, "Finalizing analysis..."]);
            setProgress(100);
            await new Promise((resolve) => setTimeout(resolve, 500));
            setData(summary);
            
            // Clear pending states upon successful upload & analysis
            setPendingFile(null);
            setPendingUserInfo(null);
            setAuthRequired(false);
            setAuthRequiredMessage(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Upload failed";
            clearInterval(progressInterval);
            
            const isAuthError = message.toLowerCase().includes("verification") || 
                                message.toLowerCase().includes("authenticate") || 
                                message.toLowerCase().includes("authorized") ||
                                message.toLowerCase().includes("403") ||
                                message.toLowerCase().includes("401");
            
            if (isAuthError) {
                // Clear staled sessionStorage auth
                aurixAPI.clearSession();
                
                // Track pending items so they don't have to re-select file/re-type info
                setPendingFile(file);
                setPendingUserInfo(userInfo);
                setAuthRequired(true);
                setAuthRequiredMessage("Your session expired. Please enter the new 6-digit verification code sent to your email to complete the audit.");
                
                // Automatically request a new OTP code!
                try {
                    await aurixAPI.requestOTP(userInfo.email);
                } catch (otpErr) {
                    console.error("Auto sending OTP failed:", otpErr);
                }
                
                // Set page error to null so we don't display the generic failure card
                setError(null);
            } else {
                setError(message);
            }
        } finally {
            setAnalyzing(false);
        }
    };

    const handleExportCSV = () => {
        const eventsToExport = currentEvents && currentEvents.length > 0 ? currentEvents : events;
        if (!eventsToExport || eventsToExport.length === 0) return;
        
        const headers = ["Timestamp", "Workflow ID", "Provider", "Model", "Cost", "Total Tokens", "Input Tokens", "Output Tokens", "Context Length", "Latency (ms)"];
        
        const csvRows = eventsToExport.map(e => {
            return [
                e.timestamp || "",
                e.workflow_id || "",
                e.provider || "",
                e.model || "",
                e.cost?.toFixed(6) || "0",
                e.total_tokens || "0",
                e.input_tokens || "0",
                e.output_tokens || "0",
                e.context_length || "0",
                e.extra_metadata?.latency_ms || "0"
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
        });
        
        const csvContent = [headers.join(","), ...csvRows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `aurex-audit-export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        if (activeTab === "data" && data && events.length === 0) {
            loadEvents();
        }
    }, [activeTab, data]);

    const loadEvents = async (workflowFilter?: string) => {
        setLoadingEvents(true);
        try {
            const fetchedEvents = await aurixAPI.getEvents({
                limit: 1000,
                workflow_id: workflowFilter,
            });
            setEvents(fetchedEvents);
        } catch (e) {
            console.error("Failed to load events:", e);
        } finally {
            setLoadingEvents(false);
        }
    };

    const calculateScore = (wastePercentage: number): number => {
        return Math.round(100 - wastePercentage);
    };

    const getSeverityColor = (severity: string) => {
        const colors: Record<string, string> = {
            LOW: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700",
            MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-700",
            HIGH: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700",
            CRITICAL: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700",
        };
        return colors[severity] || "bg-gray-100 text-gray-800";
    };

    const getIssueForWorkflow = (workflowId: string): Issue | undefined => {
        return data?.top_issues.find((issue) => issue.affected_workflow === workflowId);
    };

    const groupedEvents = events.reduce(
        (acc, event) => {
            const wid = event.workflow_id ?? "unknown";
            if (!acc[wid]) acc[wid] = [];
            acc[wid].push(event);
            return acc;
        },
        {} as Record<string, LLMEvent[]>
    );

    const workflows = Object.keys(groupedEvents);
    const allWorkflows = data ? data.workflow_breakdown.map((w) => w.workflow_id) : [];
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

    useEffect(() => {
        setCurrentPage(1);
    }, [currentWorkflow]);

    const openCopilot = (issue: Issue) => {
        setCopilotIssue(issue);
        setCopilotOpen(true);
    };

    const handleViewIssueInData = (issue: Issue) => {
        if (issue.affected_workflow) {
            setSelectedWorkflow(issue.affected_workflow);
        }
        setActiveTab("data");
        setExpandedEventId(null);
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.04, delayChildren: 0.06 },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring" as const, stiffness: 100 },
        },
    };

    const resetAudit = () => {
        setData(null);
        setError(null);
        setEvents([]);
        setExpandedEventId(null);
        setCopilotOpen(false);
        setCopilotIssue(null);
        setCurrentPage(1);
        setCompareWorkflowA("");
        setCompareWorkflowB("");
    };

    return (
        <div className="min-h-screen bg-[oklch(0.06_0.008_260)] text-foreground">
            <Navigation />
            <div className="border-b border-white/10 pt-24">
                <div className="container mx-auto px-4 py-6 md:py-12 flex flex-col items-center text-center">
                    <h1 className="font-display text-4xl font-bold tracking-tight text-white lg:text-5xl">
                        LLM Cost Audit
                    </h1>
                    <p className="mt-3 text-lg text-white/50 max-w-2xl mx-auto">
                        Upload your usage logs to discover optimization opportunities
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12">
                {!(data || analyzing) && (
                    <UploadZone 
                        onFileSelect={handleFileSelect} 
                        initialFile={pendingFile}
                        initialIsOtpStep={authRequired}
                        initialUserInfo={pendingUserInfo}
                        otpNotice={authRequiredMessage}
                        onResetPending={() => {
                            setPendingFile(null);
                            setPendingUserInfo(null);
                            setAuthRequired(false);
                            setAuthRequiredMessage(null);
                        }}
                    />
                )}

                {analyzing && (
                    <div className="mx-auto max-w-2xl">
                        <Card className="border-white/10 bg-white/[0.04] p-8 backdrop-blur-md">
                            <div className="mb-6 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                                    <Zap className="h-8 w-8 animate-pulse text-primary" />
                                </div>
                                <h2 className="font-display mb-2 text-2xl text-white">
                                    Analyzing your file
                                </h2>
                                <p className="text-white/50">{Math.round(progress)}% complete</p>
                            </div>
                            <div className="mb-6 h-2 w-full rounded-full bg-white/10">
                                <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                                {progressSteps.map((step, index) => (
                                    <div key={index} className="flex items-center gap-2 text-sm">
                                        {index === progressSteps.length - 1 && progress < 100 ? (
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                        )}
                                        <span className={index === progressSteps.length - 1 && progress < 100 ? "text-violet-200" : "text-emerald-200/80"}>
                                            {step}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex items-center gap-2 text-sm text-white/50">
                                    <ShieldCheck className="h-4 w-4" />
                                    <span>Runs on your data via your API—nothing leaves your machine in dev.</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {error && (
                    <div className="mx-auto max-w-2xl">
                        <Card className="border-red-500/30 bg-red-500/10 p-6 backdrop-blur-md">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                                <div>
                                    <h3 className="mb-1 font-semibold text-red-200">Analysis failed</h3>
                                    <p className="text-sm text-red-300/90">{error}</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 border-white/20 text-white hover:bg-white/10"
                                        onClick={resetAudit}
                                    >
                                        Try again
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {data && !analyzing && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={containerVariants}
                        className="space-y-8"
                    >
                        <motion.div variants={itemVariants} className="mx-auto max-w-4xl">
                            <CreditScoreCard
                                score={calculateScore(data.executive_summary.waste_percentage)}
                            />
                            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-md">
                                <p className="text-sm text-white/70 leading-relaxed max-w-3xl mx-auto">
                                    We analyzed <strong>{data.total_events.toLocaleString()}</strong> LLM requests across <strong>{data.workflow_breakdown.length}</strong> workflows. 
                                    Our engine identified <strong>${data.executive_summary.wasted_amount.toFixed(2)}</strong> in weekly waste, representing <strong>{data.executive_summary.waste_percentage.toFixed(1)}%</strong> of your total spend. 
                                    Implementing the top fixes below could project annual savings of <strong>${data.executive_summary.annual_savings_projection.toLocaleString()}</strong>.
                                </p>
                            </div>
                        </motion.div>

                        <motion.div
                            variants={itemVariants}
                            className="flex flex-wrap gap-2 border-b border-white/10"
                        >
                            {(["overview", "data", "compare", "insights", "savings", "settings"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-6 py-3 text-sm font-medium capitalize transition-colors ${
                                        activeTab === tab
                                            ? "border-b-2 border-violet-400 text-white"
                                            : "text-white/45 hover:text-white/80"
                                    }`}
                                >
                                    {tab === "data" ? "Data view" : tab === "compare" ? "Comparison view" : tab === "savings" ? "Savings Realization" : tab}
                                </button>
                            ))}
                        </motion.div>

                        <AnimatePresence mode="wait">
                            {activeTab === "overview" ? (
                                <motion.div
                                    key="overview"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <Card className="mx-auto max-w-5xl overflow-hidden border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-md">
                                        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                                            <div className="text-sm text-white/45">
                                                <span className="text-white/70">Audit report</span>
                                                <span className="mx-2">/</span>
                                                <span>{new Date().toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="text-white/60 hover:bg-white/10">
                                                    <Share2 className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="text-white/60 hover:bg-white/10" 
                                                    onClick={handleDownloadReport}
                                                    title="Download PDF Report"
                                                    aria-label="Download PDF Report"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-white/60 hover:bg-white/10"
                                                    onClick={resetAudit}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-8 p-6 md:p-8">
                                            <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                                                Cost optimization report
                                            </h2>

                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                                <BentoMetricCard className="md:col-span-2 lg:col-span-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                                                                Status
                                                            </p>
                                                            <Badge
                                                                variant="outline"
                                                                className={`mt-2 font-semibold ${getSeverityColor(data.executive_summary.severity)}`}
                                                            >
                                                                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                                                                {data.executive_summary.severity}
                                                            </Badge>
                                                        </div>
                                                        <BarChart3 className="h-8 w-8 text-violet-400/50" />
                                                    </div>
                                                    <p className="mt-4 text-sm text-white/55">
                                                        Severity from wasted spend vs baseline for the observed window.
                                                    </p>
                                                </BentoMetricCard>

                                                <BentoMetricCard>
                                                    <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                                                        Weekly waste
                                                    </p>
                                                    <p className="mt-2 font-display text-3xl font-bold text-red-400">
                                                        ${data.executive_summary.wasted_amount.toFixed(2)}
                                                    </p>
                                                    <p className="mt-1 text-xs text-white/40">Approx. recurring leakage</p>
                                                </BentoMetricCard>

                                                <BentoMetricCard>
                                                    <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                                                        Annual savings projection
                                                    </p>
                                                    <p className="mt-2 font-display text-3xl font-bold text-emerald-400">
                                                        ${data.executive_summary.annual_savings_projection.toLocaleString()}
                                                    </p>
                                                    <div className="mt-2 flex items-center gap-1 text-xs text-emerald-300/70">
                                                        <TrendingUp className="h-3 w-3" />
                                                        If fixes ship
                                                    </div>
                                                </BentoMetricCard>

                                                <BentoMetricCard>
                                                    <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                                                        Waste rate
                                                    </p>
                                                    <p className="mt-2 font-display text-3xl font-bold text-amber-300">
                                                        {data.executive_summary.waste_percentage.toFixed(1)}%
                                                    </p>
                                                </BentoMetricCard>

                                                <BentoMetricCard className="md:col-span-2">
                                                    <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                                                        Spend trajectory ({data.executive_summary.period_days}d)
                                                    </p>
                                                    <p className="mt-2 text-lg text-white/85">
                                                        <span className="text-white/50">Current </span>
                                                        <span className="font-mono font-semibold">
                                                            ${data.executive_summary.current_period_spend.toFixed(2)}
                                                        </span>
                                                        <span className="mx-2 text-white/35">→</span>
                                                        <span className="text-white/50">Optimized </span>
                                                        <span className="font-mono font-semibold text-emerald-300">
                                                            ${data.executive_summary.optimized_spend.toFixed(2)}
                                                        </span>
                                                    </p>
                                                </BentoMetricCard>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="flex items-center gap-2 font-semibold text-white">
                                                        <AlertTriangle className="h-5 w-5 text-amber-400/80" />
                                                        Top issues
                                                        <Badge variant="secondary" className="bg-white/10 text-white">
                                                            {data.top_issues.length}
                                                        </Badge>
                                                    </h3>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-violet-300 hover:bg-violet-500/10 hover:text-violet-200"
                                                        onClick={() => setActiveTab("insights")}
                                                    >
                                                        Agent plan →
                                                    </Button>
                                                </div>
                                                <div className="space-y-3">
                                                    {data.top_issues.slice(0, 3).map((issue) => (
                                                        <button
                                                            key={issue.rank}
                                                            type="button"
                                                            onClick={() => handleViewIssueInData(issue)}
                                                            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                                                        >
                                                            <span className="font-mono text-lg font-bold text-white/25">
                                                                #{issue.rank}
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <p className="font-medium text-white">{issue.title}</p>
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={getSeverityColor(issue.severity)}
                                                                    >
                                                                        {issue.severity}
                                                                    </Badge>
                                                                </div>
                                                                <p className="mt-1 text-xs text-white/50">
                                                                    {issue.one_line_summary}
                                                                </p>
                                                            </div>
                                                            <div className="shrink-0 text-right">
                                                                <p className="text-sm font-bold text-red-400">
                                                                    ${issue.weekly_cost.toFixed(2)}
                                                                </p>
                                                                <p className="text-[10px] text-white/35">/week</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h3 className="font-semibold text-white">Workflow breakdown</h3>
                                                <div className="space-y-3">
                                                    {data.workflow_breakdown.slice(0, 5).map((workflow) => {
                                                        const maxCost = Math.max(
                                                            ...data.workflow_breakdown.map((w) => w.total_cost)
                                                        );
                                                        const percentage = (workflow.total_cost / maxCost) * 100;
                                                        return (
                                                            <div key={workflow.workflow_id} className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <span className="text-sm font-semibold text-white flex items-center gap-2">
                                                                            {workflow.workflow_id === "unknown" ? "Unlabeled Workflow" : 
                                                                             workflow.workflow_id.startsWith("inferred_session_") ? "Inferred Session (Time-based)" : 
                                                                             workflow.workflow_id}
                                                                            
                                                                            {(workflow.workflow_id === "unknown" || workflow.workflow_id.startsWith("inferred_session_")) && (
                                                                                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/60 font-normal">
                                                                                    Missing Automation ID column in export
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                        <span className="ml-2 text-xs text-white/40">
                                                                            {workflow.request_count.toLocaleString()} requests
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-mono text-sm font-bold text-white">
                                                                        ${workflow.total_cost.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                                                    <motion.div
                                                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400"
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${percentage}%` }}
                                                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            ) : activeTab === "data" ? (
                                <motion.div
                                    key="data"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                                                Data view
                                            </h2>
                                            <p className="mt-2 text-sm text-white/50">
                                                {loadingEvents
                                                    ? "Loading…"
                                                    : `${events.length} events · ${workflows.length} workflows`}
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleExportCSV}
                                            disabled={events.length === 0}
                                            className="gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
                                        >
                                            <Download className="h-4 w-4" />
                                            Export CSV
                                        </Button>
                                    </div>

                                    {loadingEvents ? (
                                        <div className="py-20 text-center">
                                            <Zap className="mx-auto mb-4 h-12 w-12 animate-pulse text-violet-400" />
                                            <p className="text-white/50">Loading event data…</p>
                                        </div>
                                    ) : workflows.length === 0 ? (
                                        <div className="py-20 text-center">
                                            <FileText className="mx-auto mb-4 h-12 w-12 text-white/25" />
                                            <p className="text-white/50">No data available</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex gap-3 overflow-x-auto pb-2">
                                                {workflows.map((workflow) => {
                                                    const issue = getIssueForWorkflow(workflow);
                                                    const isActive = workflow === currentWorkflow;
                                                    return (
                                                        <button
                                                            key={workflow}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedWorkflow(workflow);
                                                                setExpandedEventId(null);
                                                            }}
                                                            className={`relative whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                                                                isActive
                                                                    ? "bg-white text-black shadow-lg"
                                                                    : "bg-white/5 text-white/55 hover:bg-white/10"
                                                            }`}
                                                        >
                                                            {workflow}
                                                            {issue && (
                                                                <Badge className="ml-2 bg-red-500 text-[10px] text-white">
                                                                    Issue
                                                                </Badge>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {currentIssue && (
                                                <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-900/10 p-6 backdrop-blur-md shadow-lg shadow-red-500/5">
                                                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                                                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                                                            <AlertTriangle className="h-5 w-5 text-red-400" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <h3 className="text-xl font-bold text-red-200">
                                                                    {currentIssue.title}
                                                                </h3>
                                                                <Badge className="border-red-400/40 bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
                                                                    {currentIssue.severity}
                                                                </Badge>
                                                                <Badge variant="outline" className="border-white/10 text-white/50 bg-white/5">
                                                                    {currentIssue.affected_event_count.toLocaleString()} affected requests
                                                                </Badge>
                                                            </div>
                                                            <p className="mt-3 text-sm leading-relaxed text-red-200/80">
                                                                {currentIssue.one_line_summary}
                                                            </p>
                                                            
                                                            {currentIssue.metadata?.fix_instructions && (
                                                                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
                                                                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300 mb-1">
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                        Recommended Engineering Fix
                                                                    </div>
                                                                    <p className="text-sm text-emerald-200/80 leading-relaxed">
                                                                        {currentIssue.metadata.fix_instructions}
                                                                    </p>
                                                                </div>
                                                            )}

                                                            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-red-500/10 pt-4">
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300/50">Weekly Waste</p>
                                                                    <p className="font-mono text-lg font-bold text-red-400">${currentIssue.weekly_cost.toFixed(2)}</p>
                                                                </div>
                                                                <div className="h-8 w-px bg-red-500/20 hidden sm:block"></div>
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/50">Annual Projection</p>
                                                                    <p className="font-mono text-lg font-bold text-emerald-400">${(currentIssue.weekly_cost * 52).toLocaleString()}</p>
                                                                </div>
                                                                <div className="h-8 w-px bg-red-500/20 hidden sm:block"></div>
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Engineering Effort</p>
                                                                    <p className="text-sm font-medium text-white/70">{currentIssue.fix_effort}</p>
                                                                </div>
                                                                <div className="h-8 w-px bg-red-500/20 hidden sm:block"></div>
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Confidence</p>
                                                                    <p className="text-sm font-medium text-white/70">{currentIssue.fix_confidence}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            className="shrink-0 bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/20"
                                                            onClick={() => openCopilot(currentIssue)}
                                                        >
                                                            <Zap className="mr-2 h-4 w-4" />
                                                            Fix with agent
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="border-white/10 hover:bg-transparent">
                                                            <TableHead className="w-10 text-white/50" />
                                                            <TableHead className="text-white/55">#</TableHead>
                                                            <TableHead className="text-white/55">Time</TableHead>
                                                            <TableHead className="text-white/55">Model</TableHead>
                                                            <TableHead className="text-right text-white/55">In</TableHead>
                                                            <TableHead className="text-right text-white/55">Out</TableHead>
                                                            <TableHead className="text-right text-white/55">Cost</TableHead>
                                                            <TableHead className="text-white/55">Status</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedEvents.map((event, idx) => {
                                                            const hasIssue = currentIssue !== undefined;
                                                            const isHighCost = event.cost > 0.01;
                                                            const isExpanded = expandedEventId === event.id;
                                                            const rowClass =
                                                                hasIssue && isHighCost
                                                                    ? "bg-red-500/10 border-l-4 border-l-red-500"
                                                                    : hasIssue
                                                                      ? "bg-amber-500/10 border-l-4 border-l-amber-500"
                                                                      : "hover:bg-white/[0.04]";

                                                            return (
                                                                <Fragment key={event.id}>
                                                                    <TableRow
                                                                        className={`cursor-pointer border-white/5 ${rowClass}`}
                                                                        onClick={() =>
                                                                            setExpandedEventId(isExpanded ? null : event.id)
                                                                        }
                                                                    >
                                                                        <TableCell className="text-white/40">
                                                                            {isExpanded ? (
                                                                                <ChevronDown className="h-4 w-4" />
                                                                            ) : (
                                                                                <ChevronRight className="h-4 w-4" />
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="font-mono text-xs text-white/40">
                                                                            {(currentPage - 1) * 25 + idx + 1}
                                                                        </TableCell>
                                                                        <TableCell className="font-mono text-xs text-white/60">
                                                                            {new Date(event.timestamp).toLocaleTimeString()}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 font-mono text-xs text-white/85">
                                                                                {event.model}
                                                                            </span>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono text-sm text-white/75">
                                                                            {event.input_tokens.toLocaleString()}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono text-sm text-white/75">
                                                                            {event.output_tokens.toLocaleString()}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-bold text-white">
                                                                            ${event.cost.toFixed(4)}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {hasIssue && isHighCost && (
                                                                                <Badge className="border-red-400/30 bg-red-500/15 text-xs text-red-300">
                                                                                    Critical
                                                                                </Badge>
                                                                            )}
                                                                            {hasIssue && !isHighCost && (
                                                                                <Badge className="border-amber-400/30 bg-amber-500/15 text-xs text-amber-200">
                                                                                    Watch
                                                                                </Badge>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                    {isExpanded && (
                                                                        <TableRow className="border-0 hover:bg-transparent">
                                                                            <TableCell colSpan={8} className="p-0">
                                                                                <PromptDiffPanel
                                                                                    event={event}
                                                                                    issue={currentIssue}
                                                                                />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    )}
                                                                </Fragment>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                
                                                {/* Pagination Controls */}
                                                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 bg-white/[0.01]">
                                                    <div className="text-xs text-white/40">
                                                        Showing <span className="font-mono text-white/70">{Math.min(currentEvents.length, (currentPage - 1) * 25 + 1)}</span> to{" "}
                                                        <span className="font-mono text-white/70">{Math.min(currentEvents.length, currentPage * 25)}</span> of{" "}
                                                        <span className="font-mono text-white/70">{currentEvents.length}</span> events
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={currentPage === 1}
                                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                            className="h-8 border-white/10 bg-white/5 text-xs text-white hover:bg-white/10 disabled:opacity-30"
                                                        >
                                                            Previous
                                                        </Button>
                                                        <span className="text-xs text-white/50 px-2 font-medium">
                                                            Page {currentPage} of {totalPages || 1}
                                                        </span>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={currentPage >= totalPages || totalPages === 0}
                                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                            className="h-8 border-white/10 bg-white/5 text-xs text-white hover:bg-white/10 disabled:opacity-30"
                                                        >
                                                            Next
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            ) : activeTab === "compare" ? (
                                <motion.div
                                    key="compare"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                                                Comparison view
                                            </h2>
                                            <p className="mt-2 text-sm text-white/50">
                                                Compare stats and model selections between two different workflows side-by-side.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Selection Row */}
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-white/45">Workflow A</label>
                                            <select
                                                value={compareWorkflowA}
                                                onChange={(e) => setCompareWorkflowA(e.target.value)}
                                                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white focus:outline-none focus:border-violet-500/50"
                                            >
                                                {allWorkflows.map((w) => (
                                                    <option key={w} value={w} className="bg-[oklch(0.1_0.02_260)] text-white">
                                                        {w}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-white/45">Workflow B</label>
                                            <select
                                                value={compareWorkflowB}
                                                onChange={(e) => setCompareWorkflowB(e.target.value)}
                                                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white focus:outline-none focus:border-violet-500/50"
                                            >
                                                {allWorkflows.map((w) => (
                                                    <option key={w} value={w} className="bg-[oklch(0.1_0.02_260)] text-white">
                                                        {w}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Comparison Panels */}
                                    {(() => {
                                        if (!data) return null;
                                        const wA = data.workflow_breakdown.find(w => w.workflow_id === compareWorkflowA) || data.workflow_breakdown[0];
                                        const wB = data.workflow_breakdown.find(w => w.workflow_id === compareWorkflowB) || data.workflow_breakdown[1] || data.workflow_breakdown[0];
                                        if (!wA || !wB) return null;

                                        const costDiff = wB.total_cost - wA.total_cost;
                                        const costDiffPct = wA.total_cost > 0 ? (costDiff / wA.total_cost) * 100 : 0;
                                        const reqDiff = wB.request_count - wA.request_count;
                                        const reqDiffPct = wA.request_count > 0 ? (reqDiff / wA.request_count) * 100 : 0;
                                        const costPerReqDiff = wB.cost_per_request - wA.cost_per_request;
                                        const costPerReqDiffPct = wA.cost_per_request > 0 ? (costPerReqDiff / wA.cost_per_request) * 100 : 0;

                                        const issueA = getIssueForWorkflow(wA.workflow_id);
                                        const issueB = getIssueForWorkflow(wB.workflow_id);

                                        return (
                                            <div className="grid gap-6 md:grid-cols-2">
                                                {/* Left Panel: Workflow A */}
                                                <Card className="border-white/10 bg-white/[0.02] p-6 backdrop-blur-md space-y-4">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-lg font-bold text-violet-400 truncate max-w-[70%]">
                                                            {wA.workflow_id}
                                                        </h3>
                                                        <span className="text-[10px] text-white/40 font-mono">Workflow A</span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="rounded-xl bg-white/5 p-3">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Total Spend</span>
                                                            <span className="text-xl font-bold text-white">${wA.total_cost.toFixed(2)}</span>
                                                        </div>
                                                        <div className="rounded-xl bg-white/5 p-3">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Requests</span>
                                                            <span className="text-xl font-bold text-white">{wA.request_count.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="rounded-xl bg-white/5 p-3">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Cost / Req</span>
                                                            <span className="text-xl font-bold text-white">${wA.cost_per_request.toFixed(4)}</span>
                                                        </div>
                                                        <div className="rounded-xl bg-white/5 p-3">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Total Tokens</span>
                                                            <span className="text-xl font-bold text-white">{wA.total_tokens.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/45">Models Used</h4>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {wA.models_used.map((model) => (
                                                                <span key={model} className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
                                                                    {model}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {issueA ? (
                                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <AlertCircle className="h-4 w-4 text-red-400" />
                                                                <span className="text-xs font-bold text-red-300">Audited Inefficiencies Detected</span>
                                                            </div>
                                                            <p className="text-xs text-white/70 leading-relaxed">{issueA.title}</p>
                                                            <div className="flex justify-between items-center pt-2">
                                                                <span className="text-[10px] text-white/40">Waste: ${issueA.weekly_cost.toFixed(2)}/wk</span>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => openCopilot(issueA)}
                                                                    className="h-7 text-[10px] bg-red-600/30 hover:bg-red-600 text-white rounded-lg border border-red-500/40"
                                                                >
                                                                    Remediation Copilot
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-2">
                                                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                                            <span className="text-xs font-semibold text-emerald-300">No active audit issues flagged.</span>
                                                        </div>
                                                    )}
                                                </Card>

                                                {/* Right Panel: Workflow B */}
                                                <Card className="border-white/10 bg-white/[0.02] p-6 backdrop-blur-md space-y-4">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-lg font-bold text-violet-400 truncate max-w-[70%]">
                                                            {wB.workflow_id}
                                                        </h3>
                                                        <span className="text-[10px] text-white/40 font-mono">Workflow B</span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="rounded-xl bg-white/5 p-3 relative overflow-hidden">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Total Spend</span>
                                                            <span className="text-xl font-bold text-white">${wB.total_cost.toFixed(2)}</span>
                                                            {compareWorkflowA !== compareWorkflowB && (
                                                                <span className={`absolute right-2 bottom-2 text-[9px] font-bold ${costDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                                                    {costDiff > 0 ? "+" : ""}{costDiffPct.toFixed(1)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="rounded-xl bg-white/5 p-3 relative overflow-hidden">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Requests</span>
                                                            <span className="text-xl font-bold text-white">{wB.request_count.toLocaleString()}</span>
                                                            {compareWorkflowA !== compareWorkflowB && (
                                                                <span className={`absolute right-2 bottom-2 text-[9px] font-bold ${reqDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                                                    {reqDiff > 0 ? "+" : ""}{reqDiffPct.toFixed(1)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="rounded-xl bg-white/5 p-3 relative overflow-hidden">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Cost / Req</span>
                                                            <span className="text-xl font-bold text-white">${wB.cost_per_request.toFixed(4)}</span>
                                                            {compareWorkflowA !== compareWorkflowB && (
                                                                <span className={`absolute right-2 bottom-2 text-[9px] font-bold ${costPerReqDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                                                    {costPerReqDiff > 0 ? "+" : ""}{costPerReqDiffPct.toFixed(1)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="rounded-xl bg-white/5 p-3">
                                                            <span className="block text-[10px] uppercase tracking-wider text-white/45">Total Tokens</span>
                                                            <span className="text-xl font-bold text-white">{wB.total_tokens.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/45">Models Used</h4>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {wB.models_used.map((model) => (
                                                                <span key={model} className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
                                                                    {model}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {issueB ? (
                                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <AlertCircle className="h-4 w-4 text-red-400" />
                                                                <span className="text-xs font-bold text-red-300">Audited Inefficiencies Detected</span>
                                                            </div>
                                                            <p className="text-xs text-white/70 leading-relaxed">{issueB.title}</p>
                                                            <div className="flex justify-between items-center pt-2">
                                                                <span className="text-[10px] text-white/40">Waste: ${issueB.weekly_cost.toFixed(2)}/wk</span>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => openCopilot(issueB)}
                                                                    className="h-7 text-[10px] bg-red-600/30 hover:bg-red-600 text-white rounded-lg border border-red-500/40"
                                                                >
                                                                    Remediation Copilot
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-2">
                                                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                                            <span className="text-xs font-semibold text-emerald-300">No active audit issues flagged.</span>
                                                        </div>
                                                    )}
                                                </Card>
                                            </div>
                                        );
                                    })()}
                                </motion.div>
                            ) : activeTab === "insights" ? (
                                <motion.div
                                    key="insights"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <AgentPlanPanel
                                        issues={data.top_issues}
                                        getSeverityClass={getSeverityColor}
                                        onOpenCopilot={openCopilot}
                                        onViewInData={handleViewIssueInData}
                                    />
                                    <p className="mt-8 text-center text-sm text-white/40">
                                        Total weekly waste in ranked issues:{" "}
                                        <span className="font-mono text-red-400">
                                            $
                                            {data.top_issues
                                                .reduce((acc, issue) => acc + issue.weekly_cost, 0)
                                                .toFixed(2)}
                                        </span>
                                    </p>
                                </motion.div>
                            ) : activeTab === "savings" ? (
                                <motion.div
                                    key="savings"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <SavingsPanel
                                        companyName={companyName || "Aurex Corp"}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="settings"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <SettingsPanel
                                        companyName={companyName || "Aurex Corp"}
                                        onRefreshAnalysis={handleRefreshAnalysis}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="text-center">
                            <Button
                                variant="outline"
                                className="border-white/15 text-white hover:bg-white/10"
                                onClick={() => {
                                    aurixAPI.trackClick("analyze_another_file_click", userEmail || undefined);
                                    resetAudit();
                                }}
                            >
                                Analyze another file
                            </Button>
                        </div>
                    </motion.div>
                )}
            </div>

            <AuditCopilotDock
                open={copilotOpen}
                issue={copilotIssue}
                userEmail={userEmail}
                onClose={() => {
                    setCopilotOpen(false);
                    setCopilotIssue(null);
                }}
            />
        </div>
    );
}
