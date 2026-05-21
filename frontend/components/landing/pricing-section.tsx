"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, Zap } from "lucide-react";

const plans = [
  {
    name: "Audit Edition",
    description: "For teams getting started with cost optimization",
    priceDisplay: "$0",
    billingDisplay: "forever free",
    features: [
      "1 audit per month",
      "Up to 10K tokens analyzed",
      "Basic recommendations",
      "CSV/JSON export",
      "Community support",
    ],
    highlight: false,
  },
  {
    name: "Performance Plan",
    description: "We only make money when you save money. We take a cut of the token costs we automatically save you.",
    priceDisplay: "10%",
    billingDisplay: "of realized savings",
    features: [
      "No upfront costs or flat fees",
      "Real-time observability dashboard",
      "Intelligent routing proxy",
      "Advanced cost analytics",
      "Priority support",
      "API access",
    ],
    highlight: true,
  },
  {
    name: "Inference Financing",
    description: "Extend runway with Net-30 financed inference spend. Your final 3-5% rate is determined entirely by your Token Credit Score—the more efficiently you use AI, the lower your rate.",
    priceDisplay: "3-5%",
    billingDisplay: "liquidity fee on financed spend",
    features: [
      "Everything in Performance Plan",
      "Net-30 inference financing",
      "Rate based on your token efficiency",
      "Dedicated capital partner",
      "Custom integrations & SLA",
    ],
    highlight: false,
  },
];

export function PricingSection() {
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
    <section id="pricing" ref={sectionRef} className="relative py-20 sm:py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-12 sm:mb-16 lg:mb-20">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6 sm:mb-8">
            <span className="w-12 h-px bg-foreground/30" />
            Pricing
          </span>
          <h2 className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display tracking-tight leading-[0.9] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
            Simple
            <br />
            <span className="text-stroke">pricing...</span>
          </h2>
        </div>

        {/* Pricing cards - Horizontal layout with overlap */}
        <div className="relative">
          <div className="grid lg:grid-cols-3 gap-4 lg:gap-0">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative bg-background border transition-all duration-700 ${plan.highlight
                  ? "border-foreground lg:-mx-2 lg:z-10 lg:scale-105"
                  : "border-foreground/10 lg:first:-mr-2 lg:last:-ml-2"
                  } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Popular badge */}
                {plan.highlight && (
                  <div className="absolute -top-4 left-8 right-8 flex justify-center">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-mono uppercase tracking-widest">
                      <Zap className="w-3 h-3" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-8 lg:p-10">
                  {/* Plan header */}
                  <div className="mb-8 pb-8 border-b border-foreground/10">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-2xl lg:text-3xl font-display mt-2">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl lg:text-6xl font-display">
                        {plan.priceDisplay}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 font-mono uppercase tracking-wider">
                      {plan.billingDisplay}
                    </p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-10">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[#eca8d6] mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note with icons */}
        {/* <div className={`mt-20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 pt-12 border-t border-foreground/10 transition-all duration-1000 delay-500 ${isVisible ? "opacity-100" : "opacity-0"
          }`}>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              100% local processing
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              No data retention
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              Cancel anytime
            </span>
          </div>
          <a href="#" className="text-sm underline underline-offset-4 hover:text-foreground transition-colors">
            Compare all features
          </a>
        </div> */}
      </div>

      <style jsx>{`
        .text-stroke {
          -webkit-text-stroke: 1.5px currentColor;
          -webkit-text-fill-color: transparent;
        }
      `}</style>
    </section>
  );
}
