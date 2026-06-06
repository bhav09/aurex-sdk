"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { RotateCcw, BrainCircuit, ArrowDownUp, ShieldAlert, CheckCircle2 } from "lucide-react";

export function TokenCreditScoreWidget() {
  const [score, setScore] = useState(42);
  const [activeStep, setActiveStep] = useState(-1);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.5 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const sequence = [
      { step: 0, target: 58, delay: 1000 },
      { step: 1, target: 74, delay: 2500 },
      { step: 2, target: 87, delay: 4000 },
      { step: 3, target: 98, delay: 5500 },
    ];

    sequence.forEach(({ step, target, delay }) => {
      setTimeout(() => {
        setActiveStep(step);
        animateScore(target);
      }, delay);
    });
  }, [isVisible]);

  const animateScore = (target: number) => {
    let current = score;
    const interval = setInterval(() => {
      setScore((prev) => {
        if (prev < target) return prev + 1;
        clearInterval(interval);
        return target;
      });
    }, 30);
  };

  const steps = [
    { name: "LoopGuard Enabled", icon: RotateCcw, detail: "Agent runaway blocked" },
    { name: "PromptIQ Active", icon: BrainCircuit, detail: "15% context reduction" },
    { name: "CascadeRouter Online", icon: ArrowDownUp, detail: "GPT-4o → Mini fallback" },
    { name: "ProviderShield Up", icon: ShieldAlert, detail: "99.99% uptime" },
  ];

  return (
    <div ref={sectionRef} className="w-full py-24 bg-background text-white flex flex-col items-center border-y border-white/5">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-display text-white mb-3">Watch your efficiency rise</h2>
        <p className="text-white/40">Token Credit Score increases as prevention layers activate</p>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-12 w-full max-w-4xl px-6">
        {/* Score Display */}
        <div className="relative w-64 h-64 shrink-0 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle cx="128" cy="128" r="120" fill="none" stroke="currentColor" className="text-white/5" strokeWidth="12" />
            <motion.circle
              cx="128"
              cy="128"
              r="120"
              fill="none"
              stroke="currentColor"
              className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="753.98"
              initial={{ strokeDashoffset: 753.98 * (1 - 42 / 100) }}
              animate={{ strokeDashoffset: 753.98 * (1 - score / 100) }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="text-6xl font-display font-bold tabular-nums text-white">{score}</span>
            <span className="text-xs text-white/40 font-mono tracking-wider uppercase mt-1">Credit Score</span>
          </div>
        </div>

        {/* Steps */}
        <div className="flex-1 flex flex-col gap-4 w-full">
          {steps.map((step, index) => {
            const isActive = activeStep >= index;
            const Icon = step.icon;
            
            return (
              <div
                key={step.name}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                  isActive 
                    ? "bg-white/[0.04] border-emerald-500/20 shadow-[0_0_30px_-10px_rgba(16,185,129,0.15)]" 
                    : "bg-white/[0.01] border-white/5 opacity-40"
                }`}
              >
                <div className={`p-2 rounded-lg ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/40"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className={`text-sm font-medium ${isActive ? "text-white" : "text-white/60"}`}>{step.name}</h4>
                  <p className="text-xs text-white/40 font-mono mt-1">{step.detail}</p>
                </div>
                {isActive && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
