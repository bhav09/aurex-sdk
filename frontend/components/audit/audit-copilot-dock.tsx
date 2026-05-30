"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { aurexAPI, type Issue } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Bot, X, Send, Loader2 } from "lucide-react";
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
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    useEffect(() => {
        if (open && issue) {
            setMessages([
                {
                    role: "assistant",
                    text: `Hello! I am your Aurex Agent. I have analyzed **${issue.title}** (which costs you **$${issue.weekly_cost.toFixed(2)}/week**).\n\n` +
                          `Would you like me to:\n` +
                          `- Generate a production-ready **python code patch** for this issue?\n` +
                          `- Explain the **architectural cause** of the leak?\n` +
                          `- Outline the **confidence score** or effort parameters for the remediation?`,
                },
            ]);
            setInput("");
            setLoading(false);
        }
    }, [open, issue?.rank, issue?.title]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading || !issue) return;

        const userMsg = input.trim();
        setInput("");
        
        const newMessages = [...messages, { role: "user" as const, text: userMsg }];
        setMessages(newMessages);
        setLoading(true);

        try {
            const result = await aurexAPI.generateOptimization({
                issue_type: issue.affected_workflow || "general",
                issue_title: issue.title,
                weekly_cost: issue.weekly_cost,
                one_line_summary: issue.one_line_summary,
                message: userMsg,
                chat_history: newMessages
            });
            setMessages(prev => [...prev, { role: "assistant" as const, text: result.response }]);
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: "assistant" as const, text: "Sorry, I encountered an error generating the optimization recommendation. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    function renderMessageText(text: string) {
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            if (part.startsWith("```")) {
                const lines = part.split("\n");
                const lang = lines[0].replace("```", "").trim();
                const code = lines.slice(1, -1).join("\n");
                return (
                    <pre key={index} className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-sky-200">
                        <div className="flex justify-between text-[9px] text-white/40 mb-1 border-b border-white/5 pb-1">
                            <span>{lang || "code"}</span>
                        </div>
                        <code>{code}</code>
                    </pre>
                );
            }
            
            // Split by inline code blocks
            const inlineParts = part.split(/(`[^`]+`)/g);
            return (
                <div key={index} className="mt-1 leading-relaxed">
                    {inlineParts.map((subPart, subIdx) => {
                        if (subPart.startsWith("`") && subPart.endsWith("`")) {
                            return (
                                <code key={subIdx} className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs text-pink-300">
                                    {subPart.slice(1, -1)}
                                </code>
                            );
                        }
                        // Handle bold
                        const boldParts = subPart.split(/(\*\*[^*]+\*\*)/g);
                        return boldParts.map((chunk, chunkIdx) => {
                            if (chunk.startsWith("**") && chunk.endsWith("**")) {
                                return <strong key={chunkIdx} className="font-semibold text-white">{chunk.slice(2, -2)}</strong>;
                            }
                            return <span key={chunkIdx}>{chunk}</span>;
                        });
                    })}
                </div>
            );
        });
    }

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
                                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                                        Active
                                    </span>
                                </div>
                                <p className="text-[10px] text-white/45">
                                    Remediation copilot
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

                    <div className="h-[350px] space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex flex-col space-y-1 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                                    msg.role === "assistant"
                                        ? "mr-auto border border-white/15 bg-white/[0.04] text-white/90"
                                        : "ml-auto border border-violet-500/20 bg-violet-600/30 text-white"
                                )}
                            >
                                <span className="text-[9px] font-semibold tracking-wider uppercase text-white/30">
                                    {msg.role === "assistant" ? "Aurex Copilot" : "You"}
                                </span>
                                <div>
                                    {renderMessageText(msg.text)}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex flex-col space-y-1 max-w-[85%] mr-auto rounded-2xl px-4 py-2.5 text-sm border border-white/15 bg-white/[0.04] text-white/90 animate-pulse">
                                <span className="text-[9px] font-semibold tracking-wider uppercase text-white/30">
                                    Aurex Copilot
                                </span>
                                <div className="flex items-center gap-2 text-white/60 text-xs">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Synthesizing code remediation...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSend} className="border-t border-white/10 p-3 bg-black/30 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask a question or request code..."
                            disabled={loading}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={loading || !input.trim()}
                            className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl h-9 w-9 shrink-0 shadow-md shadow-violet-500/10 disabled:opacity-50"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
