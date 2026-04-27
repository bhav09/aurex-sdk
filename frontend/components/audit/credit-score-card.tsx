"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CreditScoreCardProps {
    score: number; // 0-100
    previousScore?: number;
    className?: string;
}

export function CreditScoreCard({ score, previousScore, className }: CreditScoreCardProps) {
    const [displayScore, setDisplayScore] = useState(0);

    // Animate score on mount
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
        if (s >= 80) return "text-green-500";
        if (s >= 60) return "text-yellow-500";
        if (s >= 40) return "text-orange-500";
        return "text-red-500";
    };

    const getScoreLabel = (s: number): string => {
        if (s >= 80) return "Excellent";
        if (s >= 60) return "Good";
        if (s >= 40) return "Fair";
        return "Needs Improvement";
    };

    const getGaugeColor = (s: number): string => {
        if (s >= 80) return "#22c55e"; // green-500
        if (s >= 60) return "#eab308"; // yellow-500
        if (s >= 40) return "#f97316"; // orange-500
        return "#ef4444"; // red-500
    };

    const scoreDiff = previousScore !== undefined ? score - previousScore : null;

    return (
        <Card className={`p-8 ${className}`}>
            <div className="flex flex-col items-center">
                {/* Label */}
                <div className="text-sm font-mono text-muted-foreground mb-4">
                    TOKEN CREDIT SCORE
                </div>

                {/* Circular Gauge */}
                <div className="relative w-48 h-48 mb-6">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                        {/* Background circle */}
                        <circle
                            cx="100"
                            cy="100"
                            r="85"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="12"
                            className="text-muted/20"
                        />
                        {/* Progress circle */}
                        <circle
                            cx="100"
                            cy="100"
                            r="85"
                            fill="none"
                            stroke={getGaugeColor(displayScore)}
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${(displayScore / 100) * 534} 534`}
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>

                    {/* Score in center */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className={`text-6xl font-display ${getScoreColor(displayScore)}`}>
                            {displayScore}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">out of 100</div>
                    </div>
                </div>

                {/* Score Label */}
                <div className="text-2xl font-display mb-2">
                    {getScoreLabel(score)}
                </div>

                {/* Score Change */}
                {scoreDiff !== null && (
                    <div className="flex items-center gap-2 text-sm">
                        {scoreDiff > 0 ? (
                            <>
                                <TrendingUp className="w-4 h-4 text-green-500" />
                                <span className="text-green-500">+{scoreDiff} points</span>
                            </>
                        ) : scoreDiff < 0 ? (
                            <>
                                <TrendingDown className="w-4 h-4 text-red-500" />
                                <span className="text-red-500">{scoreDiff} points</span>
                            </>
                        ) : (
                            <>
                                <Minus className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">No change</span>
                            </>
                        )}
                        <span className="text-muted-foreground">from last audit</span>
                    </div>
                )}

                {/* Benchmark Context */}
                <div className="mt-6 pt-6 border-t border-muted-foreground/10 w-full">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">Poor</div>
                            <div className="text-sm font-mono text-red-500">0-39</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">Average</div>
                            <div className="text-sm font-mono text-yellow-500">40-79</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">Excellent</div>
                            <div className="text-sm font-mono text-green-500">80-100</div>
                        </div>
                    </div>
                </div>

                {/* What This Means */}
                <div className="mt-6 p-4 rounded-lg bg-muted/50 w-full">
                    <p className="text-sm text-muted-foreground">
                        {score >= 80 && "Your token usage is highly optimized. Keep up the great work!"}
                        {score >= 60 && score < 80 && "Good token efficiency with room for improvement. Check recommendations below."}
                        {score >= 40 && score < 60 && "Moderate token waste detected. Follow recommendations to improve your score."}
                        {score < 40 && "Significant optimization opportunities found. Implementing recommendations could save substantial costs."}
                    </p>
                </div>
            </div>
        </Card>
    );
}

// Made with Bob
