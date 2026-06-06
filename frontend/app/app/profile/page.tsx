"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aurexAPI } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    User, 
    Shield, 
    Building2, 
    CheckCircle2, 
    ArrowLeft, 
    Key, 
    Mail, 
    Landmark, 
    ChevronDown, 
    ChevronUp, 
    Loader2 
} from "lucide-react";

const DEFAULT_SCOPES = ["ledger:write", "policy:read", "savings:write"];

export default function ProfilePage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        if (!aurexAPI.hasActiveSession()) {
            router.replace("/");
            return;
        }

        const activeEmail = aurexAPI.getUserInfo()?.email;
        if (activeEmail) {
            setLoadingHistory(true);
            aurexAPI.getAuditHistory(activeEmail, 0, 20)
                .then(res => {
                    setHistory(res.sessions || []);
                })
                .catch(err => {
                    console.error("Failed to load audit history:", err);
                })
                .finally(() => {
                    setLoadingHistory(false);
                });
        }
    }, [router]);

    if (!mounted) return null;

    const userInfo = aurexAPI.getUserInfo();
    const orgId = aurexAPI.getOrgId();
    const projectId = aurexAPI.getProjectId();

    const username = userInfo?.user_name || "Workspace User";
    const email = userInfo?.email || "—";
    const company = userInfo?.company_name || "—";

    const initial = username.charAt(0).toUpperCase();

    return (
        <div className="space-y-8 text-white max-w-4xl mx-auto">
            {/* Header with back button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
                <div>
                    <h1 className="text-2xl font-serif uppercase tracking-wider font-semibold">User Profile</h1>
                    <p className="text-xs text-white/40 mt-1">Manage your identity credentials and security context.</p>
                </div>
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push("/app")}
                    className="self-start md:self-auto border-white/10 hover:bg-white/10 text-xs font-semibold uppercase tracking-wider px-4 py-2 text-white h-auto"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Overview
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Identity Card */}
                <Card className="bg-surface border-white/[0.06] md:col-span-1 flex flex-col items-center p-6 justify-center text-center space-y-4">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-3xl font-serif text-white border border-white/20 shadow-inner">
                            {initial}
                        </div>
                        <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-surface flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                        </span>
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold text-white/90">{username}</h2>
                        <Badge variant="outline" className="bg-teal-500/10 border-teal-500/20 text-teal-400 text-[10px] px-2.5 py-0.5 font-sans uppercase font-semibold">
                            Workspace Owner
                        </Badge>
                    </div>
                    <div className="w-full border-t border-white/[0.04] pt-4 mt-2 space-y-2.5 text-left text-xs">
                        <div className="flex items-center gap-2 text-white/60">
                            <Mail className="w-3.5 h-3.5 text-white/30 shrink-0" />
                            <span className="truncate">{email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                            <Landmark className="w-3.5 h-3.5 text-white/30 shrink-0" />
                            <span className="truncate">{company}</span>
                        </div>
                    </div>
                </Card>

                {/* Account Details & Context */}
                <div className="md:col-span-2 space-y-6">
                    <Card className="bg-surface border-white/[0.06]">
                        <CardHeader>
                            <CardTitle className="text-xs uppercase tracking-wider text-white/60">Security & Session</CardTitle>
                            <CardDescription className="text-white/40 text-[10px]">Active session properties and platform authorization settings.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl space-y-1">
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Active Session</span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-xs font-semibold text-white/90">Active Now</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl space-y-1">
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Authentication Type</span>
                                    <span className="text-xs font-semibold text-white/90 block mt-0.5">Single Sign-On (SSO)</span>
                                </div>
                            </div>

                            <div className="space-y-3.5 pt-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.04] pb-3 gap-1">
                                    <span className="text-xs text-white/40 flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-white/30" />
                                        Security Access Scopes
                                    </span>
                                    <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                                        {DEFAULT_SCOPES.map((scope) => (
                                            <Badge key={scope} variant="outline" className="bg-white/[0.05] border-white/10 text-white/70 text-[9px] font-mono px-2 py-0">
                                                {scope}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.04] pb-3 gap-1">
                                    <span className="text-xs text-white/40 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-white/30" />
                                        Default Org Context
                                    </span>
                                    <span className="font-mono text-[10px] text-white/70 bg-white/[0.02] border border-white/[0.06] px-2 py-0.5 rounded select-all break-all">
                                        {orgId || "—"}
                                    </span>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.04] pb-3 gap-1">
                                    <span className="text-xs text-white/40 flex items-center gap-2">
                                        <Key className="w-4 h-4 text-white/30" />
                                        Active Project Context
                                    </span>
                                    <span className="font-mono text-[10px] text-white/70 bg-white/[0.02] border border-white/[0.06] px-2 py-0.5 rounded select-all break-all">
                                        {projectId || "—"}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button 
                            variant="outline"
                            onClick={() => router.push("/app/settings")}
                            className="border-white/10 hover:bg-white/10 text-xs font-semibold uppercase tracking-wider px-4 py-2 text-white h-auto"
                        >
                            Configure Tenancy
                        </Button>
                        <Button 
                            onClick={() => router.push("/app/settings?tab=apikeys")}
                            className="bg-white hover:bg-white/90 text-black text-xs font-semibold uppercase tracking-wider px-4 py-2 h-auto"
                        >
                            Manage API Keys
                        </Button>
                    </div>
                </div>
            </div>

            {/* Audit History Section */}
            <Card className="bg-surface border-white/[0.06] mt-8">
                <CardHeader>
                    <CardTitle className="text-xs uppercase tracking-wider text-white/60">Past Audit Runs</CardTitle>
                    <CardDescription className="text-white/40 text-[10px]">
                        Review historical token efficiency and cost leak audits.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loadingHistory ? (
                        <div className="flex items-center gap-2 text-xs text-white/40 py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-white/30" />
                            <span>Loading past runs...</span>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-xs text-white/40 py-6 text-center border border-dashed border-white/[0.06] rounded-xl bg-white/[0.01]">
                            No past audit runs found. Perform your first audit from the Overview dashboard.
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.04] space-y-1">
                            {history.map((session) => {
                                const isExpanded = expandedSessionId === session.id;
                                const dateStr = new Date(session.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });
                                const score = session.credit_score !== null ? session.credit_score : 100;
                                const scoreColor = score >= 90 
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                    : score >= 70 
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                        : "bg-rose-500/10 text-rose-400 border-rose-500/20";
                                
                                return (
                                    <div key={session.id} className="pt-3 pb-2 first:pt-0">
                                        <div 
                                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                            className="flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] p-2.5 rounded-xl transition-all select-none"
                                        >
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-white/90 truncate block">
                                                        {session.file_name || "Unnamed Audit"}
                                                    </span>
                                                    <Badge variant="outline" className="text-[9px] uppercase font-mono px-1.5 py-0 bg-white/[0.04] border-white/10 text-white/50">
                                                        {session.file_type || "File"}
                                                    </Badge>
                                                </div>
                                                <span className="text-[10px] text-white/40 font-mono block">
                                                    {dateStr}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="text-right hidden sm:block space-y-0.5">
                                                    <span className="text-[10px] font-semibold text-white/80 block">
                                                        ${(session.total_cost || 0).toFixed(2)} total cost
                                                    </span>
                                                    <span className="text-[9px] text-rose-400 block font-mono">
                                                        -${(session.wasted_cost || 0).toFixed(2)} waste ({(session.waste_percentage || 0).toFixed(0)}%)
                                                    </span>
                                                </div>
                                                <Badge variant="outline" className={`text-[10px] font-mono px-2 py-0.5 ${scoreColor}`}>
                                                    {score}/100
                                                </Badge>
                                                <span className="text-white/30 hover:text-white transition-colors">
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-4.5 h-4.5" />
                                                    ) : (
                                                        <ChevronDown className="w-4.5 h-4.5" />
                                                    )}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded Analysis Details */}
                                        {isExpanded && (
                                            <div className="mt-3 mx-2.5 p-4 rounded-xl bg-white/[0.01] border border-white/[0.06] space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <div className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-lg">
                                                        <span className="text-[9px] text-white/30 uppercase tracking-wider block font-semibold">Audit Volume</span>
                                                        <span className="text-xs font-semibold text-white/90 block mt-1">
                                                            {session.total_events || 0} spans / {session.total_workflows || 0} workflows
                                                        </span>
                                                    </div>
                                                    <div className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-lg">
                                                        <span className="text-[9px] text-white/30 uppercase tracking-wider block font-semibold">Cost Savings Potential</span>
                                                        <span className="text-xs font-semibold text-emerald-400 block mt-1">
                                                            ${(session.wasted_cost || 0).toFixed(2)} recoverable
                                                        </span>
                                                    </div>
                                                    <div className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-lg">
                                                        <span className="text-[9px] text-white/30 uppercase tracking-wider block font-semibold">Realized Efficiency</span>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-emerald-500 rounded-full" 
                                                                    style={{ width: `${Math.max(0, 100 - (session.waste_percentage || 0))}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-mono font-bold text-white/80">
                                                                {(100 - (session.waste_percentage || 0)).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Mini list of top issues, showing only what's required */}
                                                {session.analysis_results?.top_issues?.length > 0 && (
                                                    <div className="space-y-1.5">
                                                        <span className="text-[9px] text-white/30 uppercase tracking-wider block font-semibold px-0.5">Primary Cost Leaks Detected</span>
                                                        <div className="space-y-1">
                                                            {session.analysis_results.top_issues.slice(0, 3).map((issue: any) => (
                                                                <div key={issue.rank} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.01] border border-white/[0.04] text-[10px]">
                                                                    <div className="flex items-center gap-2 truncate pr-2">
                                                                        <span className="font-mono text-white/30">#{issue.rank}</span>
                                                                        <span className="text-white/80 font-medium truncate">{issue.title}</span>
                                                                        <span className={`text-[8px] font-mono px-1 rounded-sm border ${
                                                                            issue.severity === "CRITICAL"
                                                                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                                                : issue.severity === "HIGH"
                                                                                    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                                        }`}>
                                                                            {issue.severity.toLowerCase()}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-rose-400 font-mono shrink-0">
                                                                        -${(issue.weekly_cost || 0).toFixed(0)}/wk
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            {session.analysis_results.top_issues.length > 3 && (
                                                                <span className="text-[9px] text-white/30 italic block px-1 mt-1">
                                                                    + {session.analysis_results.top_issues.length - 3} additional issue(s) detected.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center pt-2 border-t border-white/[0.04]">
                                                    <span className="text-[9px] font-mono text-white/30 select-all">
                                                        ID: {session.id}
                                                    </span>
                                                    <Button 
                                                        size="sm"
                                                        onClick={() => router.push(`/audit?session_id=${session.id}`)}
                                                        className="bg-white hover:bg-white/90 text-black text-[10px] font-semibold uppercase tracking-wider px-3.5 py-1.5 h-auto rounded-lg cursor-pointer"
                                                    >
                                                        Open Full Analysis
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
