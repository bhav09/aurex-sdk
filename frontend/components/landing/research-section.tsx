"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, GraduationCap } from "lucide-react";

const papers = [
  {
    title: "FrugalGPT",
    institution: "Stanford University",
    finding: "Cascade routing achieves up to 98% cost reduction at matched accuracy",
    link: "https://arxiv.org/abs/2305.05176",
    pillar: "Routing",
  },
  {
    title: "LLMLingua-2",
    institution: "Microsoft Research",
    finding: "Token classification compression runs 3–6× faster with minimal quality loss",
    link: "https://arxiv.org/abs/2403.12968",
    pillar: "Optimization",
  },
  {
    title: "Unsupervised Cycle Detection in Agentic Applications",
    institution: "arXiv:2511.10650",
    finding: "Hybrid structural + semantic detection achieves F1 0.72 vs 0.08 for structural-only",
    link: "https://arxiv.org/abs/2511.10650",
    pillar: "Loop Detection",
  },
];

export function ResearchSection() {
  const [isVisible, setIsVisible] = useState(false);
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

  return (
    <section ref={sectionRef} className="relative py-20 sm:py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-12 sm:mb-16 lg:mb-20">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6 sm:mb-8">
            <span className="w-12 h-px bg-foreground/30" />
            Research
          </span>
          <h2
            className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display tracking-tight leading-[0.9] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
          >
            Built on
            <br />
            <span className="text-muted-foreground">peer-reviewed research.</span>
          </h2>
          <p
            className={`mt-6 text-lg text-muted-foreground max-w-2xl transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
          >
            Aurex packages peer-reviewed techniques into a single in-process SDK. We didn't invent these methods - we made them production-ready.
          </p>
        </div>

        {/* Research cards */}
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {papers.map((paper, index) => (
            <a
              key={paper.title}
              href={paper.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative bg-foreground/[0.02] border border-foreground/10 hover:border-foreground/25 p-8 lg:p-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#2dd4bf]" />
                  <span className="text-xs font-mono text-[#2dd4bf]/60 uppercase tracking-wider">
                    {paper.pillar}
                  </span>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
              </div>

              <h3 className="text-xl sm:text-2xl font-display mb-2 group-hover:translate-x-1 transition-transform duration-500">
                {paper.title}
              </h3>
              <p className="text-xs font-mono text-muted-foreground/60 mb-4">
                {paper.institution}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {paper.finding}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
