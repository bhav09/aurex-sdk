"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-white/[0.08]",
}: {
  className?: string
  delay?: number
  width?: number
  height?: number
  rotate?: number
  gradient?: string
}) {
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    // Only animate on larger screens for better performance
    setShouldAnimate(window.innerWidth > 768)
  }, [])

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: shouldAnimate ? -150 : 0,
        rotate: shouldAnimate ? rotate - 15 : rotate,
      }}
      animate={{
        opacity: 1,
        y: 0,
        rotate: rotate,
      }}
      transition={{
        duration: shouldAnimate ? 2.4 : 0.8,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.2 },
      }}
      className={cn("absolute", className)}
    >
      <motion.div
        animate={shouldAnimate ? {
          y: [0, 10, 0],
        } : {}}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          width: width,
          height: height,
        }}
        className="relative"
      >
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "backdrop-blur-[2px] border-2 border-white/[0.15]",
            "shadow-[0_8px_32px_0_rgba(255,255,255,0.1)]",
            "after:absolute after:inset-0 after:rounded-full",
            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]",
          )}
        />
      </motion.div>
    </motion.div>
  )
}

export function HeroSection() {
  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.05] via-transparent to-rose-500/[0.05] blur-3xl" />

      {/* Fewer shapes on mobile, more on desktop */}
      <div className="absolute inset-0 overflow-hidden">
        <ElegantShape
          delay={0.3}
          width={600}
          height={140}
          rotate={12}
          gradient="from-teal-500/[0.15]"
          className="left-[-10%] md:left-[-5%] top-[15%] md:top-[20%]"
        />

        <ElegantShape
          delay={0.5}
          width={500}
          height={120}
          rotate={-15}
          gradient="from-rose-500/[0.15]"
          className="right-[-5%] md:right-[0%] top-[70%] md:top-[75%]"
        />

        {/* Hide some shapes on mobile for better performance */}
        <ElegantShape
          delay={0.4}
          width={300}
          height={80}
          rotate={-8}
          gradient="from-teal-500/[0.15]"
          className="hidden md:block left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]"
        />

        <ElegantShape
          delay={0.6}
          width={200}
          height={60}
          rotate={20}
          gradient="from-amber-500/[0.15]"
          className="hidden lg:block right-[15%] md:right-[20%] top-[10%] md:top-[15%]"
        />

        <ElegantShape
          delay={0.7}
          width={150}
          height={40}
          rotate={-25}
          gradient="from-cyan-500/[0.15]"
          className="hidden lg:block left-[20%] md:left-[25%] top-[5%] md:top-[10%]"
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center text-left">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/[0.03] border border-white/[0.08] mb-6 sm:mb-8 md:mb-12"
            >
              <span className="w-6 sm:w-8 h-px bg-white/30" />
              <span className="text-xs sm:text-sm text-white/60 tracking-wide font-mono">Token waste prevention platform</span>
              <span className="w-6 sm:w-8 h-px bg-white/30" />
            </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h1 className="text-[2rem] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mt-4 sm:mt-6 mb-8 sm:mb-10 md:mb-12 tracking-tight leading-[1.1] text-balance pb-1">
              <span className="block bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
                Stop the token waste
              </span>
              <span
                className={cn(
                  "block bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-white/90 to-rose-300"
                )}
              >
                before it fires.
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/40 mb-8 sm:mb-10 leading-relaxed font-light tracking-wide max-w-xl">
              Intercept and prevent LLM cost runaways in real-time, enforce budget policies at the SDK level, and optimize system prompt redundancy.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex items-center gap-4 flex-wrap"
          >
            <a href="/docs#quickstart">
              <Button className="rounded-full bg-teal-500 hover:bg-teal-400 text-white px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transition-all border-none">
                Start Building
              </Button>
            </a>
            <a href="/audit">
              <Button
                variant="outline"
                className="rounded-full border border-white/20 hover:border-white/40 text-white bg-transparent hover:bg-white/5 px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-medium transition-all"
              >
                Run free audit →
              </Button>
            </a>
          </motion.div>

          {/* Stats — research-backed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="mt-12 sm:mt-16 border-t border-white/10 pt-8"
          >
            <div className="flex items-start gap-8 sm:gap-10 lg:gap-16 flex-wrap">
              {[
                { value: "F1 0.72", label: "loop detection accuracy", source: "arXiv:2511.10650", href: "https://arxiv.org/abs/2511.10650" },
                { value: "20×", label: "prompt compression", source: "Microsoft LLMLingua-2", href: "https://www.microsoft.com/en-us/research/project/llmlingua/" },
                { value: "98%", label: "cost reduction via cascade routing", source: "Stanford FrugalGPT", href: "https://arxiv.org/abs/2305.05176" },
              ].map((stat) => (
                <a key={stat.label} href={stat.href} target="_blank" rel="noreferrer" className="flex flex-col gap-1 sm:gap-2 text-left group">
                  <span className="text-2xl sm:text-3xl font-display text-white group-hover:text-emerald-400 transition-colors">{stat.value}</span>
                  <span className="text-[10px] sm:text-xs text-white/50 leading-tight group-hover:text-white/70 transition-colors">
                    {stat.label}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-white/25 font-mono leading-tight group-hover:text-white/40 transition-colors">
                    {stat.source}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
          </div>

          {/* Right Column Terminal Mock */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="relative w-full max-w-lg mx-auto lg:ml-auto"
          >
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/60 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)] backdrop-blur-xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="ml-2 text-xs text-white/30 font-mono flex-1 text-center pr-8">aurex-intercept.py</div>
              </div>
              <div className="p-4 sm:p-5 font-mono text-[13px] leading-relaxed overflow-x-auto text-left">
                <div className="text-white/70">
                  <span className="text-emerald-400">$</span> pip install aurex-sdk
                </div>
                <div className="mt-4 text-white/70">
                  <span className="text-teal-400">from</span> aurex_sdk <span className="text-teal-400">import</span> patch_all
                </div>
                <div className="text-amber-300">patch_all()</div>
                
                <div className="mt-4 text-teal-400">import <span className="text-white/70">openai</span></div>
                <div className="text-white/70">client = openai.<span className="text-amber-300">OpenAI</span>()</div>
                <div className="text-white/70">response = client.chat.completions.<span className="text-amber-300">create</span>(</div>
                <div className="text-white/70 pl-4">model=<span className="text-emerald-300">"gpt-4o"</span>,</div>
                <div className="text-white/70 pl-4">messages=[{`{"role": "user", "content": "..."}`}]</div>
                <div className="text-white/70">)</div>

                <div className="mt-6 border-t border-white/10 pt-4" />
                
                <div className="text-emerald-400">⚡ Aurex SDK injected</div>
                <div className="text-amber-400 mt-2">⚠ LoopGuard: Agent runaway loop detected</div>
                <div className="text-white/50">  ├─ Same prompt shape 4 times in 1.2s</div>
                <div className="text-white/50">  └─ Session cost: <span className="text-white/80">$0.14</span> (ceiling: $0.15)</div>
                <div className="text-rose-400 mt-2">✕ Blocked outbound request to gpt-4o</div>
                <div className="text-emerald-400/80 text-xs mt-1">  Saved: $0.03</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/80 pointer-events-none" />
    </div>
  )
}
