"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HowItWorksSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

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
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-background text-white overflow-hidden"
    >
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="relative mb-16 text-center">
          <div className="overflow-hidden">
            <div className={`transition-all duration-1000 ${isVisible ? "translate-x-0 opacity-100" : "-translate-x-12 opacity-0"}`}>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-8">
                <span className="w-12 h-px bg-white/20" />
                How It Works
                <span className="w-12 h-px bg-white/20" />
              </span>
            </div>

            <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.85] transition-all duration-1000 delay-100 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"}`}>
              <span className="block text-white/20">Install.</span>
              <span className="block text-white/45">Intercept.</span>
              <span className="block text-white drop-shadow-[0_0_48px_rgba(255,255,255,0.12)]">Prevent.</span>
            </h2>

            <p className={`mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-mono transition-all duration-1000 delay-200 ${isVisible ? "opacity-100" : "opacity-0"}`}>
              <span className="text-white/25">pip install</span>
              <span className="text-white/15" aria-hidden="true">→</span>
              <span className="text-white/45">patch_all()</span>
              <span className="text-white/15" aria-hidden="true">→</span>
              <span className="text-white font-medium">waste prevented</span>
            </p>

            <div className={`mt-12 transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              <p className="text-xl text-white/60 mb-8 max-w-2xl mx-auto">
                Two lines of code. All four pillars activate automatically. No data leaves your machine by default.
              </p>

              {/* Code snippet preview */}
              <div className="max-w-xl mx-auto mb-8 text-left">
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-5 font-mono text-sm">
                  <div className="text-white/30 mb-2"># That&apos;s it. Two lines.</div>
                  <div><span className="text-indigo-300">from</span> <span className="text-white/70">aurex_sdk</span> <span className="text-indigo-300">import</span> <span className="text-white/70">AurexClient, patch_all</span></div>
                  <div className="mt-1"><span className="text-white/70">client = </span><span className="text-amber-300">AurexClient</span><span className="text-white/40">()</span></div>
                  <div><span className="text-amber-300">patch_all</span><span className="text-white/40">(client)</span></div>
                </div>
              </div>

              <a href="/audit">
                <Button
                  size="lg"
                  className="relative text-base font-medium rounded-full h-14 px-8 bg-white text-black hover:bg-white/90 transition-all duration-300 group"
                >
                  <span className="relative z-10">Run Free Audit</span>
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
