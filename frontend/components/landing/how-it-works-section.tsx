"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Code2, Cpu, BrainCircuit, Globe, Bot, ShieldAlert, Sparkles, Database } from "lucide-react";
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
      className="relative py-24 lg:py-32 bg-background text-foreground overflow-hidden border-t border-border"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-teal-500/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className={`text-center max-w-3xl mx-auto mb-20 transition-all duration-1000 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}>
          <p className="text-sm font-mono text-muted-foreground tracking-widest uppercase mb-6">
            How It Works
          </p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display tracking-tight mb-6">
            Drop Aurex between <br />
            <span className="text-teal-500">your app</span> and your LLMs.
          </h2>
          <p className="text-lg text-muted-foreground">
            Aurex is a thin SDK layer, not a gateway you route through. It intercepts calls in-process, decides in under 2ms, and lets your code stay exactly as it is. Works with LangChain, LlamaIndex, Vercel AI SDK, and every major provider out of the box.
          </p>
        </div>

        {/* Diagram */}
        <div className={`relative w-full aspect-auto md:h-[400px] bg-surface-sunken border border-border rounded-2xl p-8 mb-16 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 transition-all duration-1000 delay-300 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}>
          
          {/* Animated Connecting Lines (Background of diagram) */}
          <div className="absolute inset-0 pointer-events-none hidden md:block">
            <svg className="w-full h-full text-border opacity-50" preserveAspectRatio="none">
              <path d="M 220 200 L 320 200" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
              <path d="M 520 200 L 620 200" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse delay-75" />
              <path d="M 850 200 L 980 90" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse delay-150" />
              <path d="M 850 200 L 980 200" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse delay-150" />
              <path d="M 850 200 L 980 310" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse delay-150" />
            </svg>
          </div>

          {/* Column 1: Application */}
          <div className="relative z-10 w-full md:w-52 space-y-4">
            <div className="text-xs font-mono text-muted-foreground uppercase text-center mb-6 tracking-wider">Your Application</div>
            <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <Globe className="w-5 h-5 text-teal-500" />
              <span className="text-sm font-medium">Web App</span>
            </div>
            <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <Database className="w-5 h-5 text-teal-500" />
              <span className="text-sm font-medium">Workers</span>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-4">Your infrastructure</div>
          </div>

          {/* Column 2: Frameworks */}
          <div className="relative z-10 w-full md:w-48 space-y-4">
            <div className="text-xs font-mono text-muted-foreground uppercase text-center mb-6 tracking-wider">AI Frameworks</div>
            <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <Code2 className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium">LangChain / AI SDK</span>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-4">Routes each request</div>
          </div>

          {/* Column 3: Aurex SDK */}
          <div className="relative z-10 w-full md:w-64">
            <div className="text-xs font-mono text-teal-500 uppercase text-center mb-6 font-semibold tracking-wider">Intelligence Layer</div>
            <div className="bg-surface border-2 border-teal-500/50 p-5 rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.15)] relative overflow-hidden group hover:border-teal-400 transition-colors">
              <div className="absolute top-0 right-0 p-3">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                </span>
              </div>
              <div className="flex items-center gap-3 mb-5 border-b border-border pb-4">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-teal-500" />
                </div>
                <span className="font-display font-semibold text-lg tracking-tight">AUREX SDK</span>
              </div>
              <div className="space-y-3">
                <div className="text-xs flex items-center justify-between text-muted-foreground bg-muted/50 p-2 rounded-md">
                  <span className="font-mono">LoopGuard</span>
                  <span className="text-teal-500 text-[10px] uppercase font-bold tracking-wider">Active</span>
                </div>
                <div className="text-xs flex items-center justify-between text-muted-foreground bg-muted/50 p-2 rounded-md">
                  <span className="font-mono">Compressor</span>
                  <span className="text-teal-500 text-[10px] uppercase font-bold tracking-wider">Active</span>
                </div>
                <div className="text-xs flex items-center justify-between text-muted-foreground bg-muted/50 p-2 rounded-md">
                  <span className="font-mono">Cost Auditor</span>
                  <span className="text-teal-500 text-[10px] uppercase font-bold tracking-wider">Active</span>
                </div>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-4">Runs in-process</div>
          </div>

          {/* Column 4: Providers */}
          <div className="relative z-10 w-full md:w-52 space-y-4">
            <div className="text-xs font-mono text-muted-foreground uppercase text-center mb-6 tracking-wider">LLM Providers</div>
            <div className="bg-surface border border-border p-3 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <BrainCircuit className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">OpenAI</span>
            </div>
            <div className="bg-surface border border-border p-3 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Anthropic</span>
            </div>
            <div className="bg-surface border border-border p-3 rounded-xl flex items-center gap-3 shadow-sm hover:border-teal-500/50 transition-colors">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Gemini / Ollama</span>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-4">Final execution</div>
          </div>

        </div>



      </div>
    </section>
  );
}
