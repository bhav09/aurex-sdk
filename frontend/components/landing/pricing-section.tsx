"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, X, Zap } from "lucide-react";

const plans = [
  {
    name: "Developer",
    description: "For developers building locally with zero cloud dependencies",
    priceDisplay: "$0",
    billingDisplay: "forever free",
    features: [
      { text: "Local infinite loop detection", included: true },
      { text: "Local prompt optimization", included: true },
      { text: "Local circuit breakers", included: true },
      { text: "Community support", included: true },
      { text: "Cloud dashboard with trace trees", included: false },
      { text: "Team cost governance", included: false },
      { text: "OpenTelemetry export", included: false },
      { text: "Priority support", included: false },
    ],
    highlight: false,
  },
  {
    name: "Team",
    description: "For production platforms needing cloud insights, cascade routing, and team governance",
    priceDisplay: "$299",
    billingDisplay: "/month",
    features: [
      { text: "Everything in Developer", included: true },
      { text: "Cloud dashboard with trace trees", included: true },
      { text: "Cost-based routing (Phase 2)", included: true },
      { text: "Circuit breakers", included: true },
      { text: "Team cost governance", included: true },
      { text: "OpenTelemetry export", included: true },
      { text: "Slack/email alerts", included: true },
      { text: "Priority support", included: true },
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    description: "For large scale workloads requiring custom SLA, dedicated hosting, and advanced compliance",
    priceDisplay: "Custom",
    billingDisplay: "contact sales",
    features: [
      { text: "Everything in Team", included: true },
      { text: "Self-hosted control plane & DB option", included: true },
      { text: "Custom pre-call validation logic", included: true },
      { text: "Dedicated customer success engineer", included: true },
      { text: "Enterprise SLA & custom contracts", included: true },
      { text: "SSO/SAML login integration", included: true },
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
            Simple,
            <br />
            <span className="text-stroke">flat-rate.</span>
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
