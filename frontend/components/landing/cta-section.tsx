"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div
          className={`relative border border-foreground transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          onMouseMove={handleMouseMove}
        >
          {/* Spotlight effect */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0,0,0,0.15), transparent 40%)`
            }}
          />

          <div className="relative z-10 px-8 lg:px-16 py-12 lg:py-16 text-center">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-display tracking-tight mb-6 leading-[0.95]">
              Start auditing for free.
            </h2>

            <p className="text-lg text-muted-foreground mb-6 leading-relaxed max-w-2xl mx-auto">
              Upload your CSV or JSON logs and get instant insights. Download your free audit report immediately.
            </p>

            <div className="mb-8 p-4 border border-foreground/10 bg-foreground/[0.02] rounded-lg max-w-2xl mx-auto">
              <p className="text-sm text-muted-foreground mb-2">
                <span className="font-medium text-foreground">Need deeper optimization?</span>We specialize in prompt optimization, tool definition refinement, and custom model routing.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="bg-foreground hover:bg-foreground/90 text-background px-8 h-12 text-base group"
              >
                <a href="#how-it-works">
                  Try free audit now
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 px-8 text-base border-foreground/20 hover:bg-foreground/5"
              >
                <a href="/book">
                  Book optimization call
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6 font-mono">
              No credit card required • 100% local processing
            </p>
          </div>

          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-foreground/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-foreground/10" />
        </div>
      </div>
    </section>
  );
}
