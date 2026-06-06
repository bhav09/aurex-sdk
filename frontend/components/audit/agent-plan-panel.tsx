"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Issue } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Bot,
    ChevronDown,
    Code2,
    ListOrdered,
    Sparkles,
    Copy,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AgentPlanPanelProps = {
    issues: Issue[];
    getSeverityClass: (s: string) => string;
    onOpenCopilot: (issue: Issue) => void;
    onViewInData: (issue: Issue) => void;
};

function inferCodeSnippet(issue: Issue): string {
    const t = issue.issue_type?.toLowerCase() ?? "";
    if (t.includes("system") || t.includes("prompt") || t.includes("cache")) {
        return `from openai import OpenAI
client = OpenAI()

# Move static instructions to a cached system block
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system", 
            "content": STATIC_SYSTEM, 
            "cache_control": {"type": "ephemeral"}
        },
        {"role": "user", "content": user_input},
    ],
)`;
    }
    if (t.includes("model") || t.includes("misuse")) {
        return `// Route low-token tasks to a smaller model
const model = estimatedTokens < 400 ? "gpt-4o-mini" : "gpt-4o";`;
    }
    return `# Example: batch similar requests and dedupe repeated prefixes
def call_llm(user_text: str):
    return client.responses.create(
        model="gpt-4o",
        input=[{"role": "user", "content": user_text}],
        reasoning={"effort": "low"},  # if supported
    )`;
}

export function AgentPlanPanel({
    issues,
    getSeverityClass,
    onOpenCopilot,
    onViewInData,
}: AgentPlanPanelProps) {
    const [expanded, setExpanded] = useState<number | null>(
        issues.length ? issues[0].rank : null
    );
    const [copied, setCopied] = useState<number | null>(null);

    const handleCopy = (rank: number, code: string) => {
        navigator.clipboard.writeText(code);
        setCopied(rank);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center gap-3 px-1 border-b border-white/5 pb-4 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10">
                    <ListOrdered className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                    <h2 className="font-display text-xl font-bold text-white">Remediation Action Plan</h2>
                    <p className="text-xs text-white/40 font-mono">
                        Expand any issue to see an actionable remediation path & patch.
                    </p>
                </div>
            </div>

            {issues.map((issue) => {
                const isOpen = expanded === issue.rank;
                const meta = issue.metadata as Record<string, unknown> | undefined;
                const fixInstructions =
                    typeof meta?.fix_instructions === "string"
                        ? meta.fix_instructions
                        : issue.cta;

                return (
                    <motion.div
                        key={issue.rank}
                        layout
                        className={cn(
                            "overflow-hidden rounded-xl border transition-all duration-200",
                            isOpen
                                ? "border-teal-500/30 bg-surface-raised/85 shadow-lg shadow-teal-500/5 ring-1 ring-teal-500/10"
                                : "border-white/[0.06] bg-surface-raised/50 hover:border-white/10 hover:bg-surface-raised/75"
                        )}
                    >
                        <button
                            type="button"
                            className="flex w-full items-start gap-4 p-5 text-left"
                            onClick={() =>
                                setExpanded(isOpen ? null : issue.rank)
                            }
                        >
                            <span className="mt-0.5 font-mono text-xs font-bold text-white/20 select-none">
                                #0{issue.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-sm text-white">
                                        {issue.title}
                                    </h3>
                                    <Badge
                                        variant="outline"
                                        className={cn("font-mono text-[9px] px-2 py-0.2 rounded", getSeverityClass(issue.severity))}
                                    >
                                        {issue.severity}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-xs text-white/45 font-mono leading-relaxed">
                                    {issue.one_line_summary}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-4">
                                <span className="font-mono text-sm font-bold text-red-400">
                                    -${issue.weekly_cost.toFixed(0)}
                                    <span className="text-[10px] font-normal text-white/30">
                                        /wk
                                    </span>
                                </span>
                                <ChevronDown
                                    className={cn(
                                        "h-4 w-4 text-white/30 transition-transform duration-200",
                                        isOpen && "rotate-180 text-teal-400"
                                    )}
                                />
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="border-t border-white/[0.05] bg-surface-sunken/40"
                                >
                                    <div className="grid gap-6 p-5 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400/90">
                                                <Sparkles className="h-3.5 w-3.5" />
                                                REMEDIATION WORKFLOW
                                            </div>
                                            <ol className="space-y-3.5 text-xs text-white/70">
                                                <li className="flex gap-3">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                                                        1
                                                    </span>
                                                    <span>
                                                        <strong className="text-white/90">
                                                            Diagnose:
                                                        </strong>{" "}
                                                        {issue.one_line_summary}
                                                    </span>
                                                </li>
                                                <li className="flex gap-3">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                                                        2
                                                    </span>
                                                    <span>
                                                        <strong className="text-white/90">
                                                            Remediate:
                                                        </strong>{" "}
                                                        {fixInstructions}
                                                    </span>
                                                </li>
                                                <li className="flex gap-3">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                                                        3
                                                    </span>
                                                    <span>
                                                        <strong className="text-white/90">
                                                            Confidence metrics:
                                                        </strong>{" "}
                                                        {issue.fix_effort} effort ·{" "}
                                                        {issue.fix_confidence} confidence
                                                    </span>
                                                </li>
                                            </ol>
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <Button
                                                    size="sm"
                                                    className="gap-2 bg-teal-600 hover:bg-teal-500 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-teal-500/30 shadow-lg shadow-teal-500/10"
                                                    onClick={() =>
                                                        onOpenCopilot(issue)
                                                    }
                                                >
                                                    <Bot className="h-3.5 w-3.5 animate-pulse" />
                                                    Fix with agent
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-white/10 bg-transparent text-xs font-mono text-white/80 hover:bg-white/5 hover:text-white rounded-lg px-3 py-1.5"
                                                    onClick={() =>
                                                        onViewInData(issue)
                                                    }
                                                >
                                                    View in traces
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider text-teal-400">
                                                    <Code2 className="h-3.5 w-3.5" />
                                                    starter_patch.py
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleCopy(issue.rank, inferCodeSnippet(issue))}
                                                    className="h-7 w-7 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded"
                                                >
                                                    {copied === issue.rank ? (
                                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                            <pre className="max-h-[220px] overflow-auto rounded-lg border border-white/5 bg-black/40 p-4 font-mono text-[10px] leading-relaxed text-emerald-200/90 shadow-inner">
                                                {inferCodeSnippet(issue)}
                                            </pre>
                                            <p className="text-[9px] text-white/30 font-mono">
                                                * Autogenerated template. Verify signature and safety parameters before deployment.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}
