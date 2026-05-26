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
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-[#030303]">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-rose-500/[0.05] blur-3xl" />

      {/* Fewer shapes on mobile, more on desktop */}
      <div className="absolute inset-0 overflow-hidden">
        <ElegantShape
          delay={0.3}
          width={600}
          height={140}
          rotate={12}
          gradient="from-indigo-500/[0.15]"
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
          gradient="from-violet-500/[0.15]"
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
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/[0.03] border border-white/[0.08] mb-6 sm:mb-8 md:mb-12"
          >
            <span className="w-6 sm:w-8 h-px bg-white/30" />
            <span className="text-xs sm:text-sm text-white/60 tracking-wide font-mono">AI Cost Auditor for Engineering Teams</span>
            <span className="w-6 sm:w-8 h-px bg-white/30" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h1 className="text-[2.5rem] sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold mt-4 sm:mt-6 mb-8 sm:mb-10 md:mb-12 tracking-tight leading-[1.20] pb-1">
              <span className="block bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
                find where your
              </span>
              <span
                className={cn(
                  "block bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-white/90 to-rose-300"
                )}
              >
                AI budget leaks.
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/40 mb-8 sm:mb-10 leading-relaxed font-light tracking-wide max-w-2xl mx-auto px-2 sm:px-4">
              upload your llm logs, get a credit score, and see exactly which models, workflows, and prompts are wasting your budget.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex items-center justify-center gap-4 flex-wrap"
          >
            <a href="/audit">
              <Button className="rounded-full bg-white hover:bg-white/90 text-black px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transition-all">
                Run Free Audit
              </Button>
            </a>
            <a href="/docs">
              <Button
                id="hero-link-docs"
                variant="outline"
                className="rounded-full border border-white/20 hover:border-white/40 text-white bg-transparent hover:bg-white/5 px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-medium transition-all"
              >
                SDK Docs
              </Button>
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="mt-12 sm:mt-16 md:mt-20 lg:mt-24"
          >
            <div className="flex items-start justify-center gap-6 sm:gap-8 md:gap-10 lg:gap-20 flex-wrap">
              {[
                { value: "30%", label: "avg tokens wasted" },
                { value: "$2.4k", label: "potential monthly savings" },
                { value: "<30s", label: "time to audit" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1 sm:gap-2 text-center">
                  <span className="text-2xl sm:text-3xl lg:text-4xl font-display text-white">{stat.value}</span>
                  <span className="text-[10px] sm:text-xs text-white/50 leading-tight">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-[#030303]/80 pointer-events-none" />
    </div>
  )
}


