"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, X, Zap } from "lucide-react";

const plans = [
  {
    name: "Developer",
    description: "Solo Devs & Prototypes",
    priceDisplay: "$0",
    billingDisplay: "forever free",
    features: [
      { text: "Unlimited seats", included: true },
      { text: "Local-only ledger for privacy", included: true },
      { text: "Local loop detection", included: true },
      { text: "Community support", included: true },
    ],
    highlight: false,
  },
  {
    name: "Startup",
    description: "Funded AI SaaS",
    priceDisplay: "$49",
    billingDisplay: "/month flat base",
    features: [
      { text: "Unlimited seats", included: true },
      { text: "500k cloud events", included: true },
      { text: "Real-time BudgetGuard", included: true },
      { text: "Slack/email alerts", included: true },
    ],
    highlight: false,
  },
  {
    name: "Scale",
    description: "Production Agent Teams",
    priceDisplay: "$199",
    billingDisplay: "/mo + 5% ROI share",
    features: [
      { text: "Monetizing Loss Avoided", included: true },
      { text: "Active loop blocks", included: true },
      { text: "Prompt compression", included: true },
      { text: "Priority support", included: true },
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    description: "Regulated Verticals",
    priceDisplay: "Custom",
    billingDisplay: "contact sales",
    features: [
      { text: "BYOC deployment", included: true },
      { text: "SOC2/HIPAA compliance", included: true },
      { text: "Air-gapped control plane", included: true },
      { text: "Dedicated success engineer", included: true },
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
            Value-aligned
            <br />
            <span className="text-stroke">pricing.</span>
          </h2>
        </div>

        {/* Pricing cards - Horizontal layout with overlap */}
        <div className="relative">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-0">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative bg-background border transition-all duration-700 ${plan.highlight
                  ? "border-foreground xl:-mx-2 xl:z-10 xl:scale-105"
                  : "border-foreground/10 xl:first:-mr-2 xl:last:-ml-2"
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

                <div className="p-6 lg:p-8">
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
                      <span className="text-4xl lg:text-5xl font-display">
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
                      <li key={feature.text} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check className="w-4 h-4 text-[#2dd4bf] mt-0.5 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                        )}
                        <span className={`text-sm ${feature.included ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}

                </div>
              </div>
            ))}
          </div>
        </div>
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
