"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreditScoreCardProps {
    score: number; // 0-100
    previousScore?: number;
    className?: string;
}

interface TextItem {
    text: string;
}

const sizeConfig = {
    container: 'h-[400px] w-[400px]',
    fontSize: 'text-sm',
    tracking: 'tracking-[0.3em]',
    radius: 160,
    gap: 30,
    textStyle: 'font-medium',
};

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
        if (s >= 80) return "#22c55e"; // green-500
        if (s >= 60) return "#eab308"; // yellow-500
        if (s >= 40) return "#f97316"; // orange-500
        return "#ef4444"; // red-500
    };

    const getScoreLabel = (s: number): string => {
        if (s >= 80) return "Excellent";
        if (s >= 60) return "Good";
        if (s >= 40) return "Fair";
        return "Needs Improvement";
    };

    const scoreDiff = previousScore !== undefined ? score - previousScore : null;

    const items: TextItem[] = [
        { text: "TOKEN CREDIT SCORE" },
        { text: "AUREX HUB" },
        { text: `SCORE/${displayScore}` },
    ];

    const createTextSegments = () => {
        const totalItems = items.length;
        const totalGapDegrees = sizeConfig.gap * totalItems;
        const availableDegrees = 360 - totalGapDegrees;
        const segmentDegrees = availableDegrees / totalItems;

        return items.map((item, index) => {
            const startPosition = index * (segmentDegrees + sizeConfig.gap);
            const startOffset = `${(startPosition / 360) * 100}%`;
            return (
                <g key={index}>
                    <text
                        className={cn(
                            sizeConfig.fontSize,
                            sizeConfig.tracking,
                            sizeConfig.textStyle,
                            "uppercase transition-all duration-300"
                        )}
                        style={{
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <textPath
                            href="#curve"
                            className="fill-[url(#textGradient)]"
                            startOffset={startOffset}
                            textLength={`${segmentDegrees * 1.8}`}
                            lengthAdjust="spacingAndGlyphs"
                        >
                            {item.text}
                        </textPath>
                    </text>
                </g>
            );
        });
    };

    return (
        <Card className={`p-8 ${className}`}>
            <div className="flex flex-col items-center">
                {/* Circular Score Display */}
                <motion.div
                    whileHover={{
                        boxShadow: "20px 20px 40px #bebebe, -20px -20px 40px #ffffff"
                    }}
                    whileTap={{ scale: 0.98 }}
                    animate={{ y: [0, -8, 0] }}
                    transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className={cn(
                        "relative overflow-hidden mb-6",
                        sizeConfig.container,
                        "rounded-full bg-[#e6e6e6]",
                        "shadow-[16px_16px_32px_#bebebe,-16px_-16px_32px_#ffffff]",
                        "transition-all duration-500 ease-out"
                    )}
                >
                    <motion.div
                        className="absolute inset-[2px] rounded-full bg-[#e6e6e6]"
                        style={{
                            boxShadow: "inset 6px 6px 12px #d1d1d1, inset -6px -6px 12px #ffffff"
                        }}
                    />

                    <motion.div
                        className="absolute inset-[12px] rounded-full bg-[#e6e6e6]"
                        style={{
                            boxShadow: "inset 4px 4px 8px #d1d1d1, inset -4px -4px 8px #ffffff"
                        }}
                    />

                    {/* Center Score */}
                    <motion.div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="relative z-10 p-6 rounded-3xl bg-[#e6e6e6] flex flex-col items-center"
                            whileHover={{
                                boxShadow: "inset 3px 3px 6px #d1d1d1, inset -3px -3px 6px #ffffff"
                            }}
                        >
                            <div
                                className="text-7xl font-display font-bold"
                                style={{ color: getScoreColor(displayScore) }}
                            >
                                {displayScore}
                            </div>
                            <div className="text-sm text-muted-foreground mt-2">out of 100</div>
                        </motion.div>
                    </motion.div>

                    {/* Rotating Text */}
                    <motion.div
                        className="absolute inset-0"
                        initial={{ rotate: 0 }}
                        animate={{ rotate: 360 }}
                        transition={{
                            duration: 30,
                            repeat: Infinity,
                            ease: "linear"
                        }}
                    >
                        <svg viewBox="0 0 400 400" className="w-full h-full">
                            <defs>
                                <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#666666" />
                                    <stop offset="100%" stopColor="#444444" />
                                </linearGradient>
                            </defs>
                            <path
                                id="curve"
                                fill="none"
                                d={`M 200,200 m -${sizeConfig.radius},0 a ${sizeConfig.radius},${sizeConfig.radius} 0 1,1 ${sizeConfig.radius * 2},0 a ${sizeConfig.radius},${sizeConfig.radius} 0 1,1 -${sizeConfig.radius * 2},0`}
                            />
                            {createTextSegments()}
                        </svg>
                    </motion.div>
                </motion.div>

                {/* Score Label */}
                <div className="text-2xl font-display mb-2">
                    {getScoreLabel(score)}
                </div>

                {/* Score Change */}
                {scoreDiff !== null && (
                    <div className="flex items-center gap-2 text-sm mb-6">
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
                    <p className="text-sm text-muted-foreground text-center">
                        {score >= 80 && "Your token usage is highly optimized. Keep up the great work!"}
                        {score >= 60 && score < 80 && "Good token efficiency with room for improvement. Check recommendations below."}
                        {score >= 40 && score < 60 && "Moderate token waste detected. Follow recommendations to improve your score."}
                        {score < 40 && "Significant optimization opportunities found. Implementing recommendations could save substantial costs."}
                    </p>
                </div>

                {/* Action Button */}

            </div>
        </Card>
    );
}

// Made with Bob
