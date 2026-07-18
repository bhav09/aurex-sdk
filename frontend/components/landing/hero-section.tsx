"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Globe, ShieldAlert, Database, DollarSign, GitMerge, Lock, Zap } from "lucide-react"

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

      <div className="relative z-10 container mx-auto px-4 sm:px-6 md:px-8 pt-20 sm:pt-28 md:pt-36 pb-8 sm:pb-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center text-left">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/[0.03] border border-white/[0.08] mb-6 sm:mb-8 md:mb-12"
            >
              <span className="w-6 sm:w-8 h-px bg-white/30" />
              <span className="text-xs sm:text-sm text-white/60 tracking-wide font-mono">AI Runtime Layer</span>
              <span className="w-6 sm:w-8 h-px bg-white/30" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <h1 className="text-[2rem] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mt-4 sm:mt-6 mb-8 sm:mb-10 md:mb-12 tracking-tight leading-[1.1] text-balance pb-1">
                <span className="block bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
                  Infrastructure for agents
                </span>
                <span
                  className={cn(
                    "block bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-white/90 to-rose-300"
                  )}
                >
                  that run themselves.
                </span>
              </h1>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/40 mb-8 sm:mb-10 leading-relaxed font-light tracking-wide max-w-xl">
                Two lines of code give your agents a runtime that understands their behavior - routing, compressing, and recovering automatically, in-process, in under 2ms.
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

            {/* Stats - research-backed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              className="mt-12 sm:mt-16 border-t border-white/10 pt-8"
            >
              <div className="flex items-start gap-8 sm:gap-10 lg:gap-16 flex-wrap">
                {[
                  { value: "<2ms", label: "adds no noticeable delay to any request" },
                  { value: "12+", label: "providers auto-patched, out of the box" },
                  { value: "98%", label: "of requests get the right model automatically" },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1 sm:gap-2 text-left group">
                    <span className="text-2xl sm:text-3xl font-display text-white transition-colors">{stat.value}</span>
                    <span className="text-[10px] sm:text-xs text-white/50 leading-tight transition-colors">
                      {stat.label}
                    </span>
                  </div>
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
                <div className="ml-2 text-xs text-white/30 font-mono flex-1 text-center pr-8">live-request-trace</div>
              </div>
              <div className="p-5 sm:p-6 font-mono text-[13px] leading-relaxed text-left flex flex-col gap-5">
                {/* Timeline */}
                <div className="flex flex-col text-sm pt-2">
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 1.0 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">00ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Request arrives</div>
                      <div className="text-white/40 text-xs">18,400 tokens<br />Model: GPT-4o</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 1.2 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">02ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">LoopGuard check</div>
                      <div className="text-white/40 text-xs">No recursion detected</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 1.4 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">03ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Context compressed</div>
                      <div className="text-white/40 text-xs">18,400 &rarr; 2,100 tokens</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 1.6 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">04ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Cost estimated</div>
                      <div className="text-white/40 text-xs">$0.32 &rarr; $0.07</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 1.8 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">05ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <GitMerge className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Route selected</div>
                      <div className="text-white/40 text-xs">GPT-4o &rarr; GPT-4o-mini</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 2.0 }} className="flex gap-4 relative pb-5">
                    <div className="absolute left-[4.75rem] top-10 bottom-0 w-px border-l-2 border-dashed border-emerald-500/20" />
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">06ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Policy approved</div>
                      <div className="text-white/40 text-xs">Within $0.10 limit</div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 2.2 }} className="flex gap-4 relative pb-2">
                    <div className="w-10 pt-2 text-right"><span className="text-white/40">07ms</span></div>
                    <div className="relative z-10 w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="text-white/90 font-semibold mb-0.5">Execute model</div>
                      <div className="text-white/40 text-xs">Request forwarded</div>
                    </div>
                  </motion.div>
                </div>

                <div className="border-t border-white/10" />

                {/* Status Board */}
                <div className="grid grid-cols-2 gap-6">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 2.4 }} className="flex flex-col gap-2">
                    <span className="text-white/40 text-xs uppercase tracking-wider">Live Request</span>
                    <span className="text-white/90">Agent: <span className="text-amber-400">Research Assistant</span></span>
                  </motion.div>
                  <div className="flex flex-col gap-1">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 2.5 }} className="text-white/40 text-xs uppercase tracking-wider border-b border-white/10 pb-1 mb-1">Status</motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 2.6 }} className="flex justify-between"><span className="text-white/70">LoopGuard</span><span className="text-emerald-400">✓</span></motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 2.8 }} className="flex justify-between"><span className="text-white/70">Compression</span><span className="text-emerald-400">✓</span></motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 3.0 }} className="flex justify-between"><span className="text-white/70">Routing</span><span className="text-emerald-400">✓</span></motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 3.2 }} className="flex justify-between"><span className="text-white/70">Budget Check</span><span className="text-emerald-400">✓</span></motion.div>
                  </div>
                </div>

                <div className="border-t border-white/10" />

                {/* Savings summary */}
                <div className="grid grid-cols-3 gap-4 items-end bg-white/[0.02] -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-5 sm:p-6 border-t border-white/5">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 3.5 }}>
                    <div className="text-white/40 text-xs mb-1">Original Cost</div>
                    <div className="text-rose-400/80 line-through decoration-rose-500/50">$32.13</div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 3.7 }}>
                    <div className="text-white/40 text-xs mb-1">Final Cost</div>
                    <div className="text-emerald-400 text-xl font-bold">$7.02</div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, delay: 3.9, type: "spring", stiffness: 200 }} className="text-right">
                    <div className="text-white/40 text-xs mb-1">Saved</div>
                    <div className="text-teal-400 text-xl font-bold bg-teal-500/10 inline-block px-2 py-0.5 rounded border border-teal-500/20">78%</div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/80 pointer-events-none" />
    </div>
  )
}
