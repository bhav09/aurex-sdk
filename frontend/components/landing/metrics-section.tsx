"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles } from "lucide-react";

const TOOLS = [
  "OpenAI", "Anthropic", "Google Gemini", "LiteLLM",
  "LangChain", "LlamaIndex", "Vercel AI SDK", "Ollama",
  "HuggingFace", "AWS Bedrock", "CrewAI", "AutoGen"
];

const metrics = [
  {
    value: 72,
    suffix: "",
    prefix: "F1 0.",
    label: "Loop Detection Accuracy",
    sublabel: "hybrid structural + semantic",
  },
  {
    value: 4,
    suffix: "",
    prefix: "",
    label: "Prevention Pillars",
    sublabel: "Infinite Loop Detection · Prompt Optimization · Cost-Based Routing · Resilience",
  },
  {
    value: 2,
    suffix: "ms",
    prefix: "<",
    label: "Hot-Path Latency",
    sublabel: "zero network hop overhead",
  },
];



function AnimatedNumber({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const [isScrambling, setIsScrambling] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 2500;
          const startTime = performance.now();
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setCount(Math.floor(eased * end));
            setIsScrambling(progress < 0.8);
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  const displayValue = count.toLocaleString();

  return (
    <div ref={ref} className="inline-flex items-baseline">
      <span className="text-muted-foreground mr-1">{prefix}</span>
      <span className="tabular-nums">
        {displayValue.split("").map((char, i) => (
          <span
            key={i}
            className={`inline-block transition-all duration-150 ${isScrambling && char !== "," ? "blur-[1px]" : ""
              }`}
          >
            {char}
          </span>
        ))}
      </span>
      <span className="text-muted-foreground">{suffix}</span>
    </div>
  );
}

function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    // Only animate on desktop for performance
    setShouldAnimate(window.innerWidth > 1024);
  }, []);

  useEffect(() => {
    if (!shouldAnimate) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = 1; // Force 1x for better performance
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const render = (currentTime: number) => {
      // Throttle to 30fps instead of 60fps
      if (currentTime - lastTime < 33) {
        frameRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = currentTime;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);
      const gridSize = 80; // Larger grid = fewer dots
      const time = timeRef.current;
      for (let x = 0; x < width; x += gridSize) {
        for (let y = 0; y < height; y += gridSize) {
          const wave = Math.sin(x * 0.01 + y * 0.01 + time) * 0.5 + 0.5;
          const size = 1 + wave * 2;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.fill();
        }
      }
      timeRef.current += 0.015; // Slower animation
      frameRef.current = requestAnimationFrame(render);
    };
    render(0);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, [shouldAnimate]);

  if (!shouldAnimate) {
    return <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function DotGraph({
  color = "white",
  height = 32,
  freq1 = 0.35,
  freq2 = 0.12,
  freqT = 0.7,
  speed = 0.025,
  baseline = 0.3,
  amplitude = 0.5,
}: {
  color?: string;
  height?: number;
  freq1?: number;
  freq2?: number;
  freqT?: number;
  speed?: number;
  baseline?: number;
  amplitude?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timeRef = useRef(Math.random() * 100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.offsetWidth || 300;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      const t = timeRef.current;
      const cols = Math.floor(W / 8);

      for (let i = 0; i < cols; i++) {
        const raw = baseline + amplitude * Math.sin(i * freq1 + t) * Math.cos(i * freq2 + t * freqT);
        const v = Math.max(0, Math.min(1, raw));
        const dotY = H - 4 - v * (H - 8);
        const x = i * 8 + 4;
        const alpha = 0.15 + v * 0.55;
        const r = 1.5 + v * 1.2;

        ctx.beginPath();
        ctx.arc(x, dotY, r, 0, Math.PI * 2);
        ctx.fillStyle = color === "green"
          ? `rgba(236, 168, 214, ${alpha})`
          : `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      timeRef.current += speed;
      frameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameRef.current);
  }, [color, height, freq1, freq2, freqT, speed, baseline, amplitude]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: `${height}px`, display: "block" }}
    />
  );
}

export function MetricsSection() {
  const [time, setTime] = useState<Date | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);



  useEffect(() => {
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
    <section ref={sectionRef} className="relative py-16 lg:py-20 overflow-hidden border-t border-foreground/5">
      <GridBackground />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Bottom ticker - Sliding marquee */}
        <div className={`overflow-hidden transition-all duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex flex-col items-center mb-6 text-center">
            <span className="text-sm text-foreground mb-1">Aurex intercepts calls to all major providers</span>
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
              <span>0.5–2ms overhead</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>12+ providers auto-patched</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-emerald-400/80">SHA-256 only - zero prompt egress</span>
            </span>
          </div>

          <div className="pt-6 flex flex-col md:flex-row items-stretch gap-6 relative">
            <div className="flex flex-1 overflow-hidden relative order-2 md:order-1 items-center">
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 hidden md:block" />
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 hidden md:block" />

              <div className="flex gap-12 items-center w-max animate-[marquee_50s_linear_infinite]">
                {[...TOOLS, ...TOOLS, ...TOOLS].map((tool, i) => (
                  <div key={`${tool}-${i}`} className="flex items-center gap-2 text-muted-foreground/80 whitespace-nowrap hover:text-foreground transition-colors cursor-default">
                    <Sparkles className="w-3.5 h-3.5 opacity-40 text-teal-500" />
                    <span className="font-medium text-sm">{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 z-20 md:pl-6 md:border-l border-border order-1 md:order-2 flex items-center">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest font-semibold">
                Works with most tools
              </span>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes marquee {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-50%);
            }
          }
          .animate-marquee {
            animation: marquee 30s linear infinite;
          }
        `}</style>
      </div>
    </section>
  );
}


