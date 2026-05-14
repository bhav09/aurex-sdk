"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Issue } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Bot, Mail, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatLine = { role: "assistant" | "user"; text: string };

type AuditCopilotDockProps = {
    open: boolean;
    issue: Issue | null;
    userEmail?: string | null;
    onClose: () => void;
};

export function AuditCopilotDock({ open, issue, userEmail, onClose }: AuditCopilotDockProps) {
    const [messages, setMessages] = useState<ChatLine[]>([]);
    const [joinedWaitlist, setJoinedWaitlist] = useState(false);

    useEffect(() => {
        if (open && issue) {
            setMessages([
                {
                    role: "assistant",
                    text: `Hi! I'm the Aurex Agent. Soon, you'll be able to chat directly with your audit logs, ask for code snippets to fix leaks like **${issue.title}**, and optimize your stack.\n\nThis feature is currently in development. Join the waitlist to get early access!`,
                },
            ]);
            setJoinedWaitlist(false);
        }
    }, [open, issue?.rank, issue?.title]);

    const handleJoinWaitlist = () => {
        setJoinedWaitlist(true);
        // In a real app, this would make an API call to record the interest
        const emailParam = userEmail ? `&body=Please add ${encodeURIComponent(userEmail)} to the waitlist.` : "";
        window.location.href = `mailto:contact@heyaurex.com?subject=Aurex Agent Waitlist${emailParam}`;
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
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-white">
                                        Aurex agent
                                    </p>
                                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300 border border-violet-500/30">
                                        Coming Soon
                                    </span>
                                </div>
                                <p className="text-[10px] text-white/45">
                                    Chat with your logs
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

                    <div className="border-t border-white/10 p-4 bg-black/20">
                        <Button
                            onClick={handleJoinWaitlist}
                            disabled={joinedWaitlist}
                            className={cn(
                                "w-full transition-all duration-300",
                                joinedWaitlist 
                                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30" 
                                    : "bg-violet-600 hover:bg-violet-500 text-white"
                            )}
                        >
                            {joinedWaitlist ? (
                                <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Thanks for your interest!
                                </>
                            ) : (
                                <>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Join Waitlist
                                </>
                            )}
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
