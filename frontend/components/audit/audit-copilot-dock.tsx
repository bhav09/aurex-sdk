"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Issue } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatLine = { role: "assistant" | "user"; text: string };

type AuditCopilotDockProps = {
    open: boolean;
    issue: Issue | null;
    onClose: () => void;
};

export function AuditCopilotDock({ open, issue, onClose }: AuditCopilotDockProps) {
    const [messages, setMessages] = useState<ChatLine[]>([]);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        if (open && issue) {
            setMessages([
                {
                    role: "assistant",
                    text: `I’m focused on **${issue.title}** (${issue.severity}). Weekly burn: **$${issue.weekly_cost.toFixed(2)}**.\n\n${issue.one_line_summary}\n\nTell me your stack (Python/TS, OpenAI SDK version, framework) and I’ll draft a concrete change list. *This panel is a product demo—wire your model or agent here for real codegen.*`,
                },
            ]);
        }
    }, [open, issue?.rank, issue?.title]);

    const handleSend = () => {
        const t = draft.trim();
        if (!t) return;
        setMessages((m) => [...m, { role: "user", text: t }]);
        setDraft("");
        setTimeout(() => {
            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    text: "Got it. Next: paste the code path where you construct the chat payload, and I’ll suggest a minimal diff (cache policy, model routing, or batching) aligned with this issue.",
                },
            ]);
        }, 400);
    };

    return (
        <AnimatePresence>
            {open && issue && (
                <motion.div
                    initial={{ y: 120, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 120, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                    className={cn(
                        "fixed bottom-6 right-6 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15",
                        "bg-[oklch(0.1_0.02_260)]/95 shadow-2xl shadow-violet-500/10 backdrop-blur-xl"
                    )}
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/40 to-sky-500/30">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    Aurex agent
                                </p>
                                <p className="text-[10px] text-white/45">
                                    Message dock · demo UX
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "rounded-xl px-3 py-2 text-sm leading-relaxed",
                                    msg.role === "assistant"
                                        ? "border border-white/10 bg-white/[0.05] text-white/85"
                                        : "ml-6 border border-violet-500/20 bg-violet-500/10 text-white/90"
                                )}
                            >
                                {msg.text.split("\n").map((line, j) => (
                                    <p key={j} className={j > 0 ? "mt-2" : ""}>
                                        {line.split("**").map((chunk, k) =>
                                            k % 2 === 1 ? (
                                                <strong key={k}>{chunk}</strong>
                                            ) : (
                                                <span key={k}>{chunk}</span>
                                            )
                                        )}
                                    </p>
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-white/10 p-3">
                        <div className="flex gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
                            <MessageSquare className="mt-2.5 ml-2 h-4 w-4 shrink-0 text-white/35" />
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Describe your stack or paste a snippet…"
                                className="min-h-[44px] flex-1 resize-none bg-transparent py-2 text-sm text-white placeholder:text-white/35 focus:outline-none"
                            />
                            <Button
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500"
                                onClick={handleSend}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
