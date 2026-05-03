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
        {"role": "system", "content": STATIC_SYSTEM, "cache_control": {"type": "ephemeral"}},
        {"role": "user", "content": user_input},
    ],
)`;
    }
    if (t.includes("model") || t.includes("misuse")) {
        return `// Route low-token tasks to a smaller model
const model = estimatedTokens < 400 ? "gpt-4o-mini" : "gpt-4o";`;
    }
    return `# Example: batch similar requests and dedupe repeated prefixes
# ${issue.cta || "Apply the fix below"} — tune for your stack
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

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center gap-3 px-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
                    <ListOrdered className="h-5 w-5 text-violet-300" />
                </div>
                <div>
                    <h2 className="font-display text-2xl font-bold text-white">Agent plan</h2>
                    <p className="text-sm text-white/50">
                        Expand any issue to see a step-by-step remediation path—YC-ready clarity.
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
                            "overflow-hidden rounded-2xl border transition-colors",
                            isOpen
                                ? "border-white/20 bg-white/[0.06]"
                                : "border-white/10 bg-white/[0.03] hover:border-white/15"
                        )}
                    >
                        <button
                            type="button"
                            className="flex w-full items-start gap-4 p-5 text-left"
                            onClick={() =>
                                setExpanded(isOpen ? null : issue.rank)
                            }
                        >
                            <span className="mt-0.5 font-mono text-lg font-bold text-white/30">
                                #{issue.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-white">
                                        {issue.title}
                                    </h3>
                                    <Badge
                                        variant="outline"
                                        className={getSeverityClass(issue.severity)}
                                    >
                                        {issue.severity}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-sm text-white/55">
                                    {issue.one_line_summary}
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                                <span className="font-mono text-lg font-bold text-red-400">
                                    ${issue.weekly_cost.toFixed(2)}
                                    <span className="text-xs font-normal text-white/40">
                                        /wk
                                    </span>
                                </span>
                                <ChevronDown
                                    className={cn(
                                        "h-5 w-5 text-white/40 transition-transform",
                                        isOpen && "rotate-180"
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
                                    className="border-t border-white/10"
                                >
                                    <div className="grid gap-6 p-5 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400/90">
                                                <Sparkles className="h-4 w-4" />
                                                Steps
                                            </div>
                                            <ol className="space-y-3 text-sm text-white/70">
                                                <li className="flex gap-3">
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
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
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
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
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                                                        3
                                                    </span>
                                                    <span>
                                                        <strong className="text-white/90">
                                                            Effort / confidence:
                                                        </strong>{" "}
                                                        {issue.fix_effort} ·{" "}
                                                        {issue.fix_confidence}
                                                    </span>
                                                </li>
                                            </ol>
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <Button
                                                    size="sm"
                                                    className="gap-2 bg-violet-600 hover:bg-violet-500"
                                                    onClick={() =>
                                                        onOpenCopilot(issue)
                                                    }
                                                >
                                                    <Bot className="h-4 w-4" />
                                                    Fix with agent
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-white/15 bg-transparent text-white hover:bg-white/10"
                                                    onClick={() =>
                                                        onViewInData(issue)
                                                    }
                                                >
                                                    View in data
                                                </Button>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400/90">
                                                <Code2 className="h-4 w-4" />
                                                AI Gen · starter patch
                                            </div>
                                            <pre className="max-h-[280px] overflow-auto rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                                                {inferCodeSnippet(issue)}
                                            </pre>
                                            <p className="mt-2 text-[10px] text-white/35">
                                                Illustrative only—adapt to your SDK and safety policies.
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
