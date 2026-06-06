"use client";

import { useEffect, useState, useRef } from "react";
import { Check, Shield, TrendingUp, Zap, ArrowRight, BrainCircuit, ArrowDownUp } from "lucide-react";

const caseStudies = [
  {
    id: "loopguard",
    pillar: "LoopGuard",
    icon: Zap,
    company: "Series B SaaS",
    team: "8-person AI Infra Team",
    workload: "Customer support agent",
    timeToDetect: "5 minutes",
    savings: "$650/mo",
    quote: "Within 5 minutes of connecting the SDK, we found $650/month in recoverable spend from a runaway context loop in our customer support agent.",
    features: ["Agent Runaway Blocked", "Same-prompt repetition"],
    reduction: "100% loop waste eliminated",
    isComingSoon: false,
  },
  {
    id: "promptiq",
    pillar: "PromptIQ",
    icon: BrainCircuit,
    company: "Fintech Startup",
    team: "Core Engineering",
    workload: "RAG pipeline",
    timeToDetect: "3 months drift",
    savings: "$340/mo",
    quote: "Our system prompt silently grew from 400 to 1,800 tokens as devs added edge cases. PromptIQ flagged the drift and we recovered $340/month immediately.",
    features: ["Prompt Drift Detected", "CoT Inflation Flagged"],
    reduction: "75% context reduction",
    isComingSoon: false,
  },
  {
    id: "cascaderouter",
    pillar: "CascadeRouter",
    icon: ArrowDownUp,
    company: "Enterprise Retailer",
    team: "Data Science Team",
    workload: "Classification task",
    timeToDetect: "Instant",
    savings: "91%",
    quote: "We were using GPT-4o for simple classification tasks. CascadeRouter dynamically rerouted these to Mini without any code changes.",
    features: ["Dynamic Downgrade", "Complexity Scoring"],
    reduction: "91% cost reduction",
    isComingSoon: true,
  }
];

export function TestimonialsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-28 sm:py-36 bg-background text-white overflow-hidden border-t border-white/5">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.03] via-transparent to-rose-500/[0.03] blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16">
          <span className="inline-flex items-center gap-3 text-xs sm:text-sm font-mono text-white/40 mb-4 tracking-wider uppercase">
            <span className="w-12 h-px bg-white/20" />
            Verified Case Studies
          </span>
          <h2 className={`text-4xl sm:text-5xl lg:text-6xl font-display tracking-tight leading-none transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}>
            Real waste, <span className="text-[#2dd4bf]">real prevention.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {caseStudies.map((study, idx) => {
            const Icon = study.icon;
            return (
              <div key={study.id} className={`relative bg-white/[0.02] border border-white/10 rounded-3xl p-8 transition-all duration-1000 flex flex-col ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
              }`} style={{ transitionDelay: `${idx * 150}ms` }}>
                {study.isComingSoon && (
                  <div className="absolute top-6 right-6 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-mono text-white/40 uppercase tracking-wider">
                    Coming Soon
                  </div>
                )}
                
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <Icon className="w-5 h-5 text-[#2dd4bf]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white">{study.pillar}</h3>
                    <p className="text-xs text-white/40 font-mono">{study.workload}</p>
                  </div>
                </div>

                <blockquote className="text-lg leading-relaxed text-white/80 mb-8 flex-1">
                  &ldquo;{study.quote}&rdquo;
                </blockquote>

                <div className="mb-8 pt-6 border-t border-white/5">
                  <p className="text-sm font-medium text-white mb-1">{study.company}</p>
                  <p className="text-xs text-white/50">{study.team}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase mb-1">Savings</p>
                    <p className="text-xl font-display text-[#2dd4bf]">{study.savings}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase mb-1">Detection</p>
                    <p className="text-sm font-medium text-white">{study.timeToDetect}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
