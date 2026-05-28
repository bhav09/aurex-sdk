"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CreditScoreCardProps {
    score: number;
    previousScore?: number;
    className?: string;
}

export function CreditScoreCard({ score, previousScore, className }: CreditScoreCardProps) {
    const [displayScore, setDisplayScore] = useState(0);

    useEffect(() => {
        const duration = 2000;
        const steps = 60;
        const increment = score / steps;
        let current = 0;
        const timer = setInterval(() => {
            current += increment;
            if (current >= score) {
                setDisplayScore(score);
                clearInterval(timer);
            } else {
                setDisplayScore(Math.floor(current));
            }
        }, duration / steps);
        return () => clearInterval(timer);
    }, [score]);

    const getScoreColor = (s: number): string => {
        if (s >= 80) return "rgb(34 197 94)";
        if (s >= 60) return "rgb(234 179 8)";
        if (s >= 40) return "rgb(249 115 22)";
        return "rgb(239 68 68)";
    };

    const getScoreGlow = (s: number): string => {
        if (s >= 80) return "rgba(34, 197, 94, 0.45)";
        if (s >= 60) return "rgba(234, 179, 8, 0.4)";
        if (s >= 40) return "rgba(249, 115, 22, 0.45)";
        return "rgba(239, 68, 68, 0.5)";
    };

    const getScoreLabel = (s: number): string => {
        if (s >= 80) return "Excellent";
        if (s >= 60) return "Good";
        if (s >= 40) return "Fair";
        return "Needs Improvement";
    };

    const scoreDiff = previousScore !== undefined ? score - previousScore : null;
    const circumference = 2 * Math.PI * 118;
    const strokeDashoffset = circumference - (displayScore / 100) * circumference;

    return (
        <Card
            className={cn(
                "relative overflow-hidden border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40",
                className
            )}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(120,119,198,0.35),transparent)]" />
            <div className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full blur-3xl opacity-30" style={{ backgroundColor: getScoreGlow(score) }} />

            <div className="relative flex flex-col items-center px-6 py-10 md:flex-row md:items-center md:justify-center md:gap-12 md:py-12">
                <motion.div
                    className="relative mb-8 flex h-[280px] w-[280px] shrink-0 items-center justify-center md:mb-0 md:h-[320px] md:w-[320px]"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                    <div
                        className="absolute inset-0 rounded-full opacity-60 blur-xl"
                        style={{
                            background: `radial-gradient(circle, ${getScoreGlow(score)} 0%, transparent 70%)`,
                        }}
                    />
                    <svg className="relative h-full w-full -rotate-90" viewBox="0 0 260 260">
                        <defs>
                            <linearGradient id="scoreRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={getScoreColor(score)} stopOpacity={0.2} />
                                <stop offset="50%" stopColor={getScoreColor(score)} stopOpacity={1} />
                                <stop offset="100%" stopColor={getScoreColor(score)} stopOpacity={0.35} />
                            </linearGradient>
                        </defs>
                        <circle cx="130" cy="130" r="118" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                        <motion.circle
                            cx="130"
                            cy="130"
                            r="118"
                            fill="none"
                            stroke="url(#scoreRingGrad)"
                            strokeWidth="10"
                            strokeLinecap="round"
                            initial={{ strokeDashoffset: circumference }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
                            style={{ strokeDasharray: circumference }}
                        />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <motion.div
                            className="rounded-3xl border border-white/10 bg-black/40 px-8 py-6 shadow-inner backdrop-blur-md"
                            whileHover={{ scale: 1.02 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">
                                Token Credit Score
                            </p>
                            <div
                                className="mt-2 text-center font-display text-7xl font-bold tabular-nums"
                                style={{ color: getScoreColor(displayScore) }}
                            >
                                {displayScore}
                            </div>
                            <p className="mt-1 text-center text-xs text-white/40">out of 100</p>
                        </motion.div>
                    </div>
                </motion.div>

                <div className="max-w-md flex-1 text-center md:text-left">
                    <h2 className="font-display text-2xl font-bold text-white md:text-3xl">{getScoreLabel(score)}</h2>
                    {scoreDiff !== null && (
                        <div className="mt-3 flex items-center justify-center gap-2 text-sm md:justify-start">
                            {scoreDiff > 0 ? (
                                <>
                                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                                    <span className="text-emerald-400">+{scoreDiff} points</span>
                                </>
                            ) : scoreDiff < 0 ? (
                                <>
                                    <TrendingDown className="h-4 w-4 text-red-400" />
                                    <span className="text-red-400">{scoreDiff} points</span>
                                </>
                            ) : (
                                <>
                                    <Minus className="h-4 w-4 text-white/40" />
                                    <span className="text-white/50">No change</span>
                                </>
                            )}
                            <span className="text-white/40">from last audit</span>
                        </div>
                    )}

                    <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/40">Poor</div>
                            <div className="mt-1 font-mono text-sm text-red-400">0–39</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/40">Average</div>
                            <div className="mt-1 cursor-default font-mono text-sm text-amber-300">40–79</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/40">Excellent</div>
                            <div className="mt-1 font-mono text-sm text-emerald-400">80–100</div>
                        </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4">
                        <p className="text-center text-sm leading-relaxed text-white/55 md:text-left">
                            {score >= 80 && "Your token usage is highly optimized. Keep shipping the great patterns you already have."}
                            {score >= 60 && score < 80 && "Solid baseline with clear upside. Dive into the agent plan below for the fastest wins."}
                            {score >= 40 && score < 60 && "Meaningful waste detected. Prioritize the top-ranked issues, they compound weekly."}
                            {score < 40 && "Large optimization headroom. Fixing the critical issues first moves your burn curve the most."}
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
