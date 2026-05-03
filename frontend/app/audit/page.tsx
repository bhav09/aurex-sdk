"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { UploadZone } from "@/components/audit/upload-zone";
import { CreditScoreCard } from "@/components/audit/credit-score-card";
import { aurixAPI, ExecutiveSummary, Issue, LLMEvent } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    AlertCircle,
    TrendingUp,
    DollarSign,
    Zap,
    Copy,
    CheckCircle2,
    FileText,
    Download,
    AlertTriangle,
    ArrowRight,
    TrendingDown,
    Share2,
    Edit2,
    X,
    MoreHorizontal,
    Calendar,
    Tag
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from "@/components/ui/table";

export default function AuditPage() {
    const router = useRouter();
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState<string[]>([]);
    const [data, setData] = useState<ExecutiveSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "data" | "insights">("overview");
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
    const [events, setEvents] = useState<LLMEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);

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
            "Generating recommendations...",
        ];

        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep < steps.length) {
                setProgressSteps(prev => [...prev, steps[currentStep]]);
                setProgress(((currentStep + 1) / steps.length) * 100);
                currentStep++;
            } else {
                clearInterval(interval);
            }
        }, 300);

        return interval;
    };

    const handleFileSelect = async (file: File, userInfo: { user_name: string; email: string; company_name: string }) => {
        setAnalyzing(true);
        setProgress(0);
        setProgressSteps([]);
        setError(null);
        setData(null);
        setEvents([]);

        const progressInterval = simulateProgress();

        try {
            // Use the complete audit flow that creates session, uploads, analyzes, and stores results
            const { session, summary } = await aurixAPI.completeAudit(file, userInfo, true);

            console.log('Audit session created:', session);
            console.log('Credit score:', session.credit_score);

            await new Promise(resolve => setTimeout(resolve, 3000));
            setData(summary);
        } catch (err: any) {
            setError(err.message);
            clearInterval(progressInterval);
        } finally {
            setAnalyzing(false);
        }
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
                workflow_id: workflowFilter
            });
            setEvents(fetchedEvents);
        } catch (err: any) {
            console.error("Failed to load events:", err);
        } finally {
            setLoadingEvents(false);
        }
    };

    const calculateScore = (wastePercentage: number): number => {
        return Math.round(100 - wastePercentage);
    };

    const getSeverityColor = (severity: string) => {
        const colors: Record<string, string> = {
            LOW: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700',
            MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-700',
            HIGH: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700',
            CRITICAL: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700',
        };
        return colors[severity] || 'bg-gray-100 text-gray-800';
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Get issue for a workflow
    const getIssueForWorkflow = (workflowId: string): Issue | undefined => {
        return data?.top_issues.find(issue => issue.affected_workflow === workflowId);
    };

    // Group events by workflow
    const groupedEvents = events.reduce((acc, event) => {
        if (!acc[event.workflow_id]) {
            acc[event.workflow_id] = [];
        }
        acc[event.workflow_id].push(event);
        return acc;
    }, {} as Record<string, LLMEvent[]>);

    const workflows = Object.keys(groupedEvents);
    const currentWorkflow = selectedWorkflow || workflows[0];
    const currentEvents = currentWorkflow ? groupedEvents[currentWorkflow] : [];
    const currentIssue = currentWorkflow ? getIssueForWorkflow(currentWorkflow) : undefined;

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.04, delayChildren: 0.06 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: 'spring' as const, stiffness: 100 }
        }
    };

    function GrowthIcon({ growth }: { growth: number }) {
        return growth >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
        );
    }

    return (
        <div className="min-h-screen bg-[oklch(0.06_0.008_260)]">
            {/* Header */}
            <div className="border-b border-white/10">
                <div className="container mx-auto px-4 py-8">
                    <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight">LLM Cost Audit</h1>
                    <p className="text-muted-foreground mt-3 text-lg">
                        Upload your usage logs to discover optimization opportunities
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12">
                {/* Upload Section */}
                {!data && !analyzing && (
                    <UploadZone onFileSelect={handleFileSelect} />
                )}

                {/* Analyzing Section */}
                {analyzing && (
                    <div className="max-w-2xl mx-auto">
                        <Card className="p-8">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Zap className="w-8 h-8 text-primary animate-pulse" />
                                </div>
                                <h2 className="text-2xl font-display mb-2">
                                    Analyzing your file
                                </h2>
                                <p className="text-muted-foreground">
                                    {Math.round(progress)}% complete
                                </p>
                            </div>

                            <div className="w-full bg-muted rounded-full h-2 mb-6">
                                <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>

                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {progressSteps.map((step, index) => (
                                    <div key={index} className="flex items-center gap-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                        <span className="text-green-600">{step}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-muted-foreground/10">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>100% Local Processing</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Error Section */}
                {error && (
                    <div className="max-w-2xl mx-auto">
                        <Card className="p-6 border-red-200 bg-red-50">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-red-900 mb-1">Analysis Failed</h3>
                                    <p className="text-sm text-red-700">{error}</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4"
                                        onClick={() => {
                                            setError(null);
                                            setData(null);
                                        }}
                                    >
                                        Try Again
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Results Section */}
                {data && !analyzing && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={containerVariants}
                        className="space-y-8"
                    >
                        {/* Score Card */}
                        <motion.div variants={itemVariants} className="max-w-2xl mx-auto">
                            <CreditScoreCard
                                score={calculateScore(data.executive_summary.waste_percentage)}
                            />
                        </motion.div>

                        {/* Tab Navigation */}
                        <motion.div variants={itemVariants} className="flex gap-2 border-b">
                            <button
                                onClick={() => setActiveTab("overview")}
                                className={`px-6 py-3 font-medium transition-colors ${activeTab === "overview"
                                    ? "border-b-2 border-primary text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab("data")}
                                className={`px-6 py-3 font-medium transition-colors ${activeTab === "data"
                                    ? "border-b-2 border-primary text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                Data View
                            </button>
                            <button
                                onClick={() => setActiveTab("insights")}
                                className={`px-6 py-3 font-medium transition-colors ${activeTab === "insights"
                                    ? "border-b-2 border-primary text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                Insights
                            </button>
                        </motion.div>

                        <AnimatePresence mode="wait">
                            {activeTab === "overview" ? (
                                <motion.div
                                    key="overview"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <Card className="w-full max-w-4xl mx-auto overflow-hidden border-none shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
                                        <div className="p-4 border-b bg-muted/30">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm text-muted-foreground">
                                                    <span>Audit Report</span>
                                                    <span className="mx-2">/</span>
                                                    <span>{new Date().toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button variant="ghost" size="icon"><Share2 className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => {
                                                        setData(null);
                                                        setError(null);
                                                    }}><X className="h-4 w-4" /></Button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 md:p-8 space-y-8">
                                            <h1 className="text-3xl font-bold tracking-tight">Cost Optimization Report</h1>

                                            {/* Meta Info Grid */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                                <div className="flex items-start gap-3">
                                                    <MoreHorizontal className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                                    <div>
                                                        <p className="text-muted-foreground">Status</p>
                                                        <Badge variant="outline" className={`mt-1 font-semibold ${getSeverityColor(data.executive_summary.severity)}`}>
                                                            <span className="mr-2 h-2 w-2 rounded-full bg-current animate-pulse"></span>
                                                            {data.executive_summary.severity}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <DollarSign className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                                    <div>
                                                        <p className="text-muted-foreground">Weekly Waste</p>
                                                        <p className="font-bold text-red-600 mt-1">
                                                            ${data.executive_summary.wasted_amount.toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <TrendingUp className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                                    <div>
                                                        <p className="text-muted-foreground">Annual Savings</p>
                                                        <p className="font-bold text-green-600 mt-1">
                                                            ${data.executive_summary.annual_savings_projection.toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <AlertCircle className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                                    <div>
                                                        <p className="text-muted-foreground">Waste Rate</p>
                                                        <p className="font-bold text-orange-600 mt-1">
                                                            {data.executive_summary.waste_percentage.toFixed(1)}%
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3 col-span-1 md:col-span-2">
                                                    <FileText className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                                    <div>
                                                        <p className="text-muted-foreground">Summary</p>
                                                        <p className="mt-1 text-foreground/80">
                                                            Current: ${data.executive_summary.current_weekly_spend.toFixed(2)}/week
                                                            {' → '}
                                                            Optimized: ${data.executive_summary.optimized_spend.toFixed(2)}/week
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Top Issues */}
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="font-semibold flex items-center gap-2">
                                                        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                                                        Top Issues
                                                        <Badge variant="secondary">{data.top_issues.length}</Badge>
                                                    </h3>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setActiveTab("insights")}
                                                    >
                                                        View Details →
                                                    </Button>
                                                </div>
                                                <div className="space-y-3">
                                                    {data.top_issues.slice(0, 3).map((issue) => (
                                                        <div key={issue.rank} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer" onClick={() => {
                                                            setSelectedIssue(issue);
                                                            setActiveTab("data");
                                                        }}>
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-lg font-bold text-gray-400">#{issue.rank}</span>
                                                                    <p className="font-medium text-sm">{issue.title}</p>
                                                                    <Badge className={getSeverityColor(issue.severity)} variant="outline">
                                                                        {issue.severity}
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground">{issue.one_line_summary}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-bold text-red-600 text-sm">${issue.weekly_cost.toFixed(2)}</p>
                                                                <p className="text-xs text-muted-foreground">/week</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Workflow Breakdown */}
                                            <div className="space-y-4">
                                                <h3 className="font-semibold">Workflow Breakdown</h3>
                                                <div className="space-y-3">
                                                    {data.workflow_breakdown.slice(0, 5).map((workflow) => {
                                                        const maxCost = Math.max(...data.workflow_breakdown.map(w => w.total_cost));
                                                        const percentage = (workflow.total_cost / maxCost) * 100;

                                                        return (
                                                            <div key={workflow.workflow_id} className="space-y-2">
                                                                <div className="flex justify-between items-center">
                                                                    <div>
                                                                        <span className="font-semibold text-sm">{workflow.workflow_id}</span>
                                                                        <span className="text-xs text-gray-500 ml-2">
                                                                            {workflow.request_count.toLocaleString()} requests
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-bold text-sm">${workflow.total_cost.toFixed(2)}</span>
                                                                </div>
                                                                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                                                                    <div
                                                                        className="bg-blue-600 h-2 rounded-full transition-all"
                                                                        style={{ width: `${percentage}%` }}
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
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-3xl font-display font-bold tracking-tight">Data View</h2>
                                            <p className="text-sm text-white/60 mt-2">
                                                {loadingEvents ? "Loading..." : `${events.length} events across ${workflows.length} workflows`}
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" className="gap-2 bg-white/5 border-white/10 hover:bg-white/10">
                                            <Download className="w-4 h-4" />
                                            Export CSV
                                        </Button>
                                    </div>

                                    {loadingEvents ? (
                                        <div className="text-center py-20">
                                            <Zap className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
                                            <p className="text-white/60 text-lg">Loading event data...</p>
                                        </div>
                                    ) : workflows.length === 0 ? (
                                        <div className="text-center py-20">
                                            <FileText className="w-12 h-12 mx-auto mb-4 text-white/40" />
                                            <p className="text-white/60 text-lg">No data available</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Workflow Tabs */}
                                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                                {workflows.map((workflow) => {
                                                    const issue = getIssueForWorkflow(workflow);
                                                    const isActive = workflow === currentWorkflow;
                                                    return (
                                                        <button
                                                            key={workflow}
                                                            onClick={() => setSelectedWorkflow(workflow)}
                                                            className={`relative px-6 py-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${isActive
                                                                ? "bg-white text-black"
                                                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                                                                }`}
                                                        >
                                                            <span className="relative z-10">{workflow}</span>
                                                            {issue && (
                                                                <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0 bg-red-500">
                                                                    Issue
                                                                </Badge>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Issue Alert */}
                                            {currentIssue && (
                                                <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/20">
                                                    <div className="flex items-start gap-4">
                                                        <div className="p-2 rounded-lg bg-red-500/20">
                                                            <AlertTriangle className="w-5 h-5 text-red-400" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <h3 className="font-semibold text-red-400 text-lg">
                                                                    {currentIssue.title}
                                                                </h3>
                                                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs uppercase">
                                                                    {currentIssue.severity}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-sm text-red-300/80 mb-3">
                                                                {currentIssue.one_line_summary}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-red-400 text-lg">
                                                                    ${currentIssue.weekly_cost.toFixed(2)}/week wasted
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Data Table */}
                                            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm">
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="border-white/10 hover:bg-transparent">
                                                                <TableHead className="text-white/60 font-medium">No</TableHead>
                                                                <TableHead className="text-white/60 font-medium">Timestamp</TableHead>
                                                                <TableHead className="text-white/60 font-medium">Model</TableHead>
                                                                <TableHead className="text-right text-white/60 font-medium">Input Tokens</TableHead>
                                                                <TableHead className="text-right text-white/60 font-medium">Output Tokens</TableHead>
                                                                <TableHead className="text-right text-white/60 font-medium">Cost</TableHead>
                                                                <TableHead className="text-white/60 font-medium">Status</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {currentEvents.slice(0, 50).map((event, idx) => {
                                                                const hasIssue = currentIssue !== undefined;
                                                                const isHighCost = event.cost > 0.01;
                                                                const rowClass = hasIssue && isHighCost
                                                                    ? "bg-red-500/10 border-l-4 border-l-red-500 hover:bg-red-500/15"
                                                                    : hasIssue
                                                                        ? "bg-yellow-500/10 border-l-4 border-l-yellow-500 hover:bg-yellow-500/15"
                                                                        : "hover:bg-white/5";

                                                                return (
                                                                    <TableRow key={event.id} className={`border-white/5 ${rowClass}`}>
                                                                        <TableCell className="text-white/40 font-mono text-xs">{idx + 1}</TableCell>
                                                                        <TableCell className="text-white/60 font-mono text-xs">
                                                                            {new Date(event.timestamp).toLocaleTimeString()}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="inline-flex px-2 py-1 rounded-md bg-white/10 border border-white/10">
                                                                                <span className="text-xs font-mono text-white/80">{event.model}</span>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono text-sm text-white/80">
                                                                            {event.input_tokens.toLocaleString()}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono text-sm text-white/80">
                                                                            {event.output_tokens.toLocaleString()}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-bold text-white">
                                                                            ${event.cost.toFixed(4)}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {hasIssue && isHighCost && (
                                                                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                                                                    Critical
                                                                                </Badge>
                                                                            )}
                                                                            {hasIssue && !isHighCost && (
                                                                                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                                                                                    Warning
                                                                                </Badge>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                                {currentEvents.length > 50 && (
                                                    <div className="p-4 text-center text-sm text-white/40 border-t border-white/5 font-mono">
                                                        Showing 50 of {currentEvents.length} events
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="insights"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <div className="bg-background overflow-x-auto">
                                        <Table className="min-w-[600px]">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[5%]">#</TableHead>
                                                    <TableHead className="w-[30%]">
                                                        <div className="flex flex-col">
                                                            <span>Issue</span>
                                                            <Progress value={70} className="h-1 mt-1" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[15%]">
                                                        <div className="flex flex-col">
                                                            <span>Severity</span>
                                                            <Progress value={60} className="h-1 mt-1" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[15%]">
                                                        <div className="flex flex-col">
                                                            <span>Weekly Cost</span>
                                                            <Progress value={80} className="h-1 mt-1" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[15%]">
                                                        <div className="flex flex-col">
                                                            <span>Fix Effort</span>
                                                            <Progress value={50} className="h-1 mt-1" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="text-center w-[10%]">Trend</TableHead>
                                                    <TableHead className="w-[10%]">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.top_issues.map((issue) => (
                                                    <TableRow key={issue.rank} className="hover:bg-muted/50">
                                                        <TableCell className="font-bold text-gray-400">
                                                            #{issue.rank}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-medium">{issue.title}</p>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {issue.one_line_summary}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className={getSeverityColor(issue.severity)}>
                                                                {issue.severity}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-bold text-red-600">
                                                            ${issue.weekly_cost.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {issue.fix_effort}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <GrowthIcon growth={-issue.weekly_cost} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedIssue(issue);
                                                                    setActiveTab("data");
                                                                }}
                                                            >
                                                                View
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow>
                                                    <TableCell colSpan={3}>Total Weekly Waste</TableCell>
                                                    <TableCell className="font-bold text-red-600">
                                                        ${data.top_issues.reduce((acc, issue) => acc + issue.weekly_cost, 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell colSpan={3}></TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                        <p className="mt-4 text-center text-sm text-muted-foreground">
                                            Comprehensive cost analysis with actionable insights
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Upload Another */}
                        <div className="text-center">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setData(null);
                                    setError(null);
                                    setSelectedIssue(null);
                                    setEvents([]);
                                }}
                            >
                                Analyze Another File
                            </Button>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}

// Made with Bob
