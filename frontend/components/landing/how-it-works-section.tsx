"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HowItWorksSection() {
  const router = useRouter();
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

  const handleGetStarted = () => {
    router.push("/audit");
  };

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-[oklch(0.09_0.01_260)] text-white overflow-hidden"
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
              <span className="block">Upload.</span>
              <span className="block text-white/30">Analyze.</span>
              <span className="block text-white/10">Optimize.</span>
            </h2>

            <div className={`mt-12 transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              <p className="text-xl text-white/60 mb-8 max-w-2xl mx-auto">
                Get instant insights into your LLM costs and discover optimization opportunities in minutes.
              </p>

              <Button
                onClick={handleGetStarted}
                size="lg"
                className="relative text-base font-medium rounded-full h-14 px-8 bg-white text-black hover:bg-white/90 transition-all duration-300 group"
              >
                <span className="relative z-10">Start Your Free Audit</span>
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </div>

        {/* Supported integrations */}
        <div className={`mt-16 transition-all duration-1000 delay-400 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <p className="text-sm text-white/40 mb-4 text-center">
            Works with exports from:
          </p>
          <div className="flex flex-wrap justify-center gap-4 items-center">
            {["LangSmith", "Helicone", "OpenAI", "Anthropic", "Custom JSON"].map((integration) => (
              <div
                key={integration}
                className="px-4 py-2 border border-white/20 bg-black/40 text-sm font-mono hover:border-white/40 transition-colors"
              >
                {integration}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Made with Bob
