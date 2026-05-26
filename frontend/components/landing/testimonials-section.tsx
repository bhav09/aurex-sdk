"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";

const insights = [
  {
    quote: "Most people debug this by tracing individual calls but the real problem is usually not knowing which node in your workflow is responsible for what chunk of spend. Basic logging won't catch it if you have multiple models or code steps mixed together.",
    // author: "Anonymous",
    source: "Reddit",
    platform: "reddit",
    insight: "Workflow-level visibility is critical",
  },
  {
    quote: "Yeah this happens a lot, costs look fine overall but leaks show up per workflow. Repeated system prompts plus growing context usually the main culprits, also agent retries quietly add up. Once you add per flow logging plus pruning, things become way clearer.",
    // author: "AI Engineer",
    source: "Reddit Discussion",
    platform: "reddit",
    insight: "Hidden costs in agent workflows",
  },
  {
    quote: "Token usage spikes can indeed be frustrating to diagnose, especially in complex agent setups. A single line integration that provides real-time visualization of the execution graph, showing where each token is consumed in the workflow, helps pinpoint the source of unexpected usage.",
    // author: "LangGraphics Creator",
    source: "Reddit",
    platform: "reddit",
    insight: "Real-time visibility prevents surprises",
  },
  {
    quote: "Love langsmith - but would really love something local to test with too.",
    // author: "Developer",
    source: "Reddit",
    platform: "reddit",
    insight: "Local processing is a key requirement",
  },
  {
    quote: "Once you start looking it's like pulling on a piece of string 😅 The best solution is to just track an event whenever inference happens and handle the aggregation out of your app. It's pretty neat since we can then see all the overall costs for a particular workflow.",
    // author: "Credyt.ai Team",
    source: "Reddit",
    platform: "reddit",
    insight: "Event-based tracking reveals patterns",
  },
  {
    quote: "Ran into this exact thing. Turns out one of our agents was re-sending the full conversation history on every tool call because the prompt was built wrong. Each tool call doubled the context. Helicone caught it - you can trace per-call token usage and filter by agent. Took 20 min to spot a $200/month leak.",
    // author: "Engineering Team",
    source: "Reddit",
    platform: "reddit",
    insight: "Context explosion is common and costly",
  },
  {
    quote: "We cut roughly 40% of spend just by routing classification tasks to a smaller model and saving the heavy ones for generation only. The 'use the biggest model for everything' default is almost always the first place to look.",
    author: "AI Leader",
    source: "LinkedIn",
    platform: "linkedin",
    insight: "Model selection drives major savings",
  },
  {
    quote: "In my experience the visibility was usually there once we wired up Helicone or similar. The hard part was deciding whether to spend two weeks on prompt caching vs shipping the next feature.",
    author: "CTO",
    source: "LinkedIn",
    platform: "linkedin",
    insight: "Prioritization requires clear data",
  },
  {
    quote: "Common pattern: small inefficiencies compound faster than most teams expect.",
    author: "AI Founder",
    source: "LinkedIn",
    platform: "linkedin",
    insight: "Early detection prevents escalation",
  },
  {
    quote: "Visibility into token usage is the only way to prevent these sudden cost spikes in production.",
    author: "Platform Engineer",
    source: "LinkedIn",
    platform: "linkedin",
    insight: "Proactive monitoring is essential",
  },
  {
    quote: "This is the real problem, not high costs, but invisible costs. It needs to be mapped for cost → feature → outcome.",
    author: "VP of Engineering",
    source: "In-Person Event",
    platform: "event",
    insight: "Cost attribution drives decisions",
  },
];

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
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

  useEffect(() => {
    const interval = setInterval(() => {
      setDirection("right");
      setActiveIndex((prev) => (prev + 1) % insights.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const goTo = (index: number) => {
    setDirection(index > activeIndex ? "right" : "left");
    setActiveIndex(index);
  };

  const goPrev = () => {
    setDirection("left");
    setActiveIndex((prev) => (prev - 1 + insights.length) % insights.length);
  };

  const goNext = () => {
    setDirection("right");
    setActiveIndex((prev) => (prev + 1) % insights.length);
  };

  const activeInsight = insights[activeIndex];

  const getPlatformBadge = (platform: string) => {
    const badges = {
      reddit: { label: "Reddit", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
      linkedin: { label: "LinkedIn", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      event: { label: "In-Person", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    };
    return badges[platform as keyof typeof badges] || badges.reddit;
  };

  return (
    <section ref={sectionRef} className="relative py-32 lg:py-40 bg-foreground text-background overflow-hidden">
      {/* Subtle background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-20">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-background/40 mb-4">
              <span className="w-12 h-px bg-background/20" />
              Market Research
            </span>
            <h2 className={`text-4xl lg:text-5xl font-display transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}>
              What founders are saying
              <span className="text-background/40"> about LLM costs.</span>
            </h2>
            <p className="mt-4 text-background/60 text-lg max-w-2xl">
              Real insights from Reddit, LinkedIn, and in-person conversations with AI engineering teams.
            </p>
          </div>

          {/* Navigation arrows */}
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={goPrev}
              className="p-4 border border-background/20 hover:bg-background/10 transition-colors"
              aria-label="Previous insight"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="p-4 border border-background/20 hover:bg-background/10 transition-colors"
              aria-label="Next insight"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main content - Split layout */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          {/* Quote side */}
          <div className="lg:col-span-7 relative">
            {/* Large quote mark */}
            <span className="absolute -left-4 -top-8 text-[200px] font-display text-background/5 leading-none select-none">
              &ldquo;
            </span>

            <div className="relative">
              <blockquote
                key={activeIndex}
                className="text-2xl lg:text-3xl xl:text-4xl font-display leading-[1.3] tracking-tight animate-fadeSlideIn"
              >
                {activeInsight.quote}
              </blockquote>

              {/* Author */}
              <div className="mt-12 flex items-center gap-6">
                <div className="w-14 h-14 rounded-full bg-background/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-lg font-medium">{activeInsight.author}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-1 rounded-full border ${getPlatformBadge(activeInsight.platform).color}`}>
                      {getPlatformBadge(activeInsight.platform).label}
                    </span>
                    <span className="text-background/60 text-sm">
                      {activeInsight.source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Insight cards side */}
          <div className="lg:col-span-5 flex flex-col justify-center gap-6">
            {/* Active insight - Large */}
            <div
              key={`insight-${activeIndex}`}
              className="p-10 border border-background/20 bg-background/5 animate-fadeSlideIn"
            >
              <span className="text-xs font-mono text-background/40 uppercase tracking-widest block mb-4">
                Key Insight
              </span>
              <span className="text-2xl lg:text-3xl font-display block leading-tight">
                {activeInsight.insight}
              </span>
            </div>

            {/* Progress indicators */}
            <div className="flex gap-2">
              {insights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  className="flex-1 h-1 bg-background/20 overflow-hidden"
                  aria-label={`Go to insight ${idx + 1}`}
                >
                  <div
                    className={`h-full bg-background transition-all duration-300 ${idx === activeIndex ? "w-full" : idx < activeIndex ? "w-full opacity-50" : "w-0"
                      }`}
                    style={idx === activeIndex ? { animation: "progress 8s linear forwards" } : {}}
                  />
                </button>
              ))}
            </div>

            {/* Platform filters */}
            <div className="mt-4 pt-6 border-t border-background/10">
              <span className="text-xs font-mono text-background/30 uppercase tracking-widest block mb-4">
                Sources
              </span>
              <div className="flex flex-wrap gap-3">
                {["reddit", "linkedin", "event"].map((platform) => {
                  const count = insights.filter(i => i.platform === platform).length;
                  const badge = getPlatformBadge(platform);
                  return (
                    <button
                      key={platform}
                      onClick={() => {
                        const firstIndex = insights.findIndex(i => i.platform === platform);
                        if (firstIndex !== -1) goTo(firstIndex);
                      }}
                      className={`px-4 py-2 text-sm border transition-all ${badge.color}`}
                    >
                      {badge.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-background/10">
              <div>
                <p className="text-3xl font-display">{insights.length}</p>
                <p className="text-sm text-background/60">Real insights</p>
              </div>
              <div>
                <p className="text-3xl font-display">3</p>
                <p className="text-sm text-background/60">Platforms</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-fadeSlideIn {
          animation: fadeSlideIn 0.5s ease-out forwards;
        }
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </section>
  );
}


