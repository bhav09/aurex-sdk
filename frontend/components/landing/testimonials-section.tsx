"use client";

import { useEffect, useState, useRef } from "react";
import { Check, Shield, TrendingUp, Zap } from "lucide-react";

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
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] via-transparent to-rose-500/[0.03] blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-16 sm:mb-24">
          <span className="inline-flex items-center gap-3 text-xs sm:text-sm font-mono text-white/40 mb-4 tracking-wider uppercase">
            <span className="w-12 h-px bg-white/20" />
            Verified Case Study
          </span>
          <h2 className={`text-4xl sm:text-5xl lg:text-6xl font-display tracking-tight leading-none transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}>
            Instant ROI in <span className="text-[#eca8d6]">minutes.</span>
          </h2>
        </div>

        {/* Main single case study card - Rich Aesthetics */}
        <div className={`relative bg-white/[0.02] border border-white/10 rounded-3xl p-8 sm:p-12 lg:p-16 transition-all duration-1000 delay-100 ${
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.05] via-transparent to-[#eca8d6]/[0.05] rounded-3xl pointer-events-none" />
          
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Metric side */}
            <div className="lg:col-span-5 space-y-8">
              <div className="space-y-2">
                <span className="text-sm font-mono text-white/40 uppercase tracking-widest block">Time to Detect</span>
                <div className="text-5xl sm:text-7xl font-display font-bold text-white flex items-baseline gap-2">
                  5 <span className="text-2xl sm:text-3xl text-white/50 font-light">minutes</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-mono text-white/40 uppercase tracking-widest block">Identified Leakage</span>
                <div className="text-5xl sm:text-7xl font-display font-bold text-[#eca8d6] flex items-baseline gap-2">
                  $650<span className="text-2xl sm:text-3xl text-[#eca8d6]/60 font-light">/mo</span>
                </div>
                <p className="text-xs font-mono text-white/35">≈ $7,800 annualized run-rate</p>
              </div>

              <div className="pt-6 flex flex-wrap gap-4">
                <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-xs text-white/70 font-mono">
                  <Zap className="w-3.5 h-3.5 text-indigo-400" />
                  Runaway Loop Found
                </span>
                <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-xs text-white/70 font-mono">
                  <Shield className="w-3.5 h-3.5 text-rose-400" />
                  Context Exploded 4x
                </span>
              </div>
            </div>

            {/* Testimonial Quote side */}
            <div className="lg:col-span-7 space-y-8 lg:border-l lg:border-white/10 lg:pl-12">
              <span className="absolute right-8 bottom-8 text-[180px] font-display text-white/[0.02] leading-none select-none pointer-events-none">
                &ldquo;
              </span>

              <blockquote className="text-2xl sm:text-3xl font-display leading-[1.3] text-white/90">
                &ldquo;Within 5 minutes of connecting the SDK, we found $650/month in recoverable spend from a runaway context loop in our customer support agent. Shifting simple classification calls to a smaller model reduced our spend by 90% instantly.&rdquo;
              </blockquote>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-[#eca8d6] flex items-center justify-center font-bold text-black font-mono">
                  TX
                </div>
                <div>
                  <p className="text-lg font-medium text-white">Engineering Lead</p>
                  <p className="text-sm text-white/50">Team X · AI Infrastructure & Platforms</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div>
                  <div className="flex items-center gap-2 text-white/50 text-xs font-mono uppercase tracking-wider mb-1">
                    <Check className="w-3.5 h-3.5 text-[#eca8d6]" />
                    Integration
                  </div>
                  <p className="text-sm text-white/90">SDK Zero-Code</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-white/50 text-xs font-mono uppercase tracking-wider mb-1">
                    <Check className="w-3.5 h-3.5 text-[#eca8d6]" />
                    Remediation
                  </div>
                  <p className="text-sm text-white/90">Instant Routing</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2 text-white/50 text-xs font-mono uppercase tracking-wider mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-[#eca8d6]" />
                    Verified Savings
                  </div>
                  <p className="text-sm text-[#eca8d6] font-medium">90% reduction</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
