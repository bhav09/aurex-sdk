"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, BrainCircuit, ArrowDownUp, ShieldAlert } from "lucide-react";

const pillars = [
  {
    number: "01",
    title: "Infinite Loop Detection",
    description: "Multi-layered detection matching exact tool calls, context window explosions, and semantic fuzzy repetitions.",
    stats: { value: "F1: 0.72", label: "vs 0.08 for naive step limits" },
    icon: RotateCcw,
    docsHref: "/docs/reference#infinite-loop-detection",
  },
  {
    number: "02",
    title: "Prompt Optimization",
    description: "Flags prompt drift, chain-of-thought inflation, and caching opportunities without reading raw prompt text.",
    stats: { value: "$60/day", label: "flagged in a typical RAG pipeline" },
    icon: BrainCircuit,
    docsHref: "/docs/reference#prompt-optimization",
  },
  {
    number: "03",
    title: "Cost-Based Routing",
    description: "Downgrade simple queries to cheaper models dynamically using token credit scores and query complexity.",
    stats: { value: "98%", label: "cost reduction (Stanford FrugalGPT)" },
    icon: ArrowDownUp,
    docsHref: "/docs/reference#cost-based-routing",
  },
  {
    number: "04",
    title: "Resilience & Fallbacks",
    description: "Circuit breakers for provider outages. Automatically falls back to secondary providers if latency spikes.",
    stats: { value: "0ms", label: "latency penalty vs external gateways" },
    icon: ShieldAlert,
    docsHref: "/docs/reference#resilience-fallbacks",
  },
];

// Floating dot particles visualization
function ParticleVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener("mousemove", handleMouseMove);

    // Generate stable particle positions
    const COUNT = 70;
    const particles = Array.from({ length: COUNT }, (_, i) => {
      const seed = i * 1.618;
      return {
        bx: ((seed * 127.1) % 1),
        by: ((seed * 311.7) % 1),
        phase: seed * Math.PI * 2,
        speed: 0.4 + (seed % 0.4),
        radius: 1.2 + (seed % 2.2),
      };
    });

    let time = 0;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      particles.forEach((p) => {
        const flowX = Math.sin(time * p.speed * 0.4 + p.phase) * 38;
        const flowY = Math.cos(time * p.speed * 0.3 + p.phase * 0.7) * 24;

        const bx = p.bx * w;
        const by = p.by * h;
        const dx = p.bx - mx;
        const dy = p.by - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist * 2.8);

        const x = bx + flowX + influence * Math.cos(time + p.phase) * 36;
        const y = by + flowY + influence * Math.sin(time + p.phase) * 36;

        const pulse = Math.sin(time * p.speed + p.phase) * 0.5 + 0.5;
        const alpha = 0.08 + pulse * 0.18 + influence * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, p.radius + pulse * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      time += 0.016;
      frameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export function FeaturesSection() {
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
      id="pillars"
      ref={sectionRef}
      className="relative py-16 sm:py-20 lg:py-28 overflow-hidden"
    >
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="relative mb-12 sm:mb-16 lg:mb-20">
          <div className="grid lg:grid-cols-12 gap-6 sm:gap-8 items-end">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4 sm:mb-6">
                <span className="w-12 h-px bg-foreground/30" />
                Four Pillars
              </span>
              <h2
                className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display tracking-tight leading-[0.9] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
              >
                Prevention,
                <br />
                <span className="text-muted-foreground">not observability.</span>
              </h2>
            </div>
            <div className="lg:col-span-5 lg:pb-4">
              <p className={`text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}>
                Four in-process capabilities that detect and stop token waste before a single wasted token is billed.
              </p>
            </div>
          </div>
        </div>

        {/* Four-pillar grid */}
        <div className="relative">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {pillars.map((pillar, index) => (
              <div
                key={pillar.number}
                className={`relative bg-background border border-foreground/10 min-h-[380px] sm:min-h-[420px] overflow-hidden group transition-all duration-700 hover:border-foreground/25 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                  }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="relative h-full p-6 sm:p-8 bg-background">
                  <ParticleVisualization />
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-mono text-xs sm:text-sm text-muted-foreground">{pillar.number}</span>
                      <pillar.icon className="w-4 h-4 text-[#2dd4bf]" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-display mt-1 mb-4 group-hover:translate-x-2 transition-transform duration-500">
                      {pillar.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">
                      {pillar.description}
                    </p>
                    <div className="mt-auto">
                      <span className="text-3xl sm:text-4xl font-display">{pillar.stats.value}</span>
                      <span className="block text-xs text-muted-foreground font-mono mt-2">{pillar.stats.label}</span>
                    </div>
                    <a
                      href={pillar.docsHref}
                      className="inline-flex items-center gap-1 text-xs text-[#2dd4bf]/60 hover:text-[#2dd4bf] font-mono mt-4 transition-colors"
                    >
                      Read docs →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
