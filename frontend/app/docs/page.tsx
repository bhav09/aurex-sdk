import Link from "next/link";
import { Cpu, Cloud, Layers, BookOpen, ArrowRight, Bot } from "lucide-react";

export const metadata = {
  title: "Aurex SDK Documentation",
  description:
    "Track LLM cost locally, sync metadata to your project, and block waste using real-time circuit breakers.",
};

const cards = [
  {
    href: "/docs/installation",
    title: "Installation & Quick Start",
    description: "Install the Python or Node SDK, configure API keys, and log your first event.",
    icon: Cpu,
  },
  {
    href: "/docs/deployment",
    title: "Cloud Deployment",
    description: "Serverless flush patterns, read-only filesystem fallbacks, bounded queues, and per-key rate limits.",
    icon: Cloud,
  },
  {
    href: "/docs/harness",
    title: "Harness Integration",
    description: "Choose patch vs wrap vs instrument(client) based on your observability maturity.",
    icon: Layers,
  },
  {
    href: "/docs/reference",
    title: "Full API Reference",
    description: "AurexConfig, BudgetGuard, providers, guards, health monitoring, and CI policy gates.",
    icon: BookOpen,
  },
];

export default function DocsOverviewPage() {
  return (
    <div className="space-y-10">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">SDK v0.2 Parity</span>
        </div>
        <h1 className="text-4xl font-display font-bold tracking-tight text-white mb-3">
          Aurex SDK Documentation
        </h1>
        <p className="text-white/50 max-w-2xl leading-relaxed">
          Aurex watches LLM calls locally, hashes prompts for zero-PII telemetry, and optionally syncs metadata to
          your Aurex project. Budget guards and downgrade rules run in-process without adding network latency to every
          call.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <Bot className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-white">Agent-friendly reference</h2>
          <p className="text-xs text-white/40 mt-1">
            Task → URL routing table and full API spec for coding assistants:{" "}
            <Link href="/llms.txt" className="text-indigo-400 hover:text-indigo-300">
              /llms.txt
            </Link>
            . Use anchor links (e.g.{" "}
            <Link href="/docs/reference#config-reference" className="text-indigo-400 hover:text-indigo-300">
              /docs/reference#config-reference
            </Link>
            ) to jump directly to a section.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
          >
            <card.icon className="w-5 h-5 text-emerald-400 mb-3" />
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {card.title}
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
            </h2>
            <p className="text-sm text-white/45 mt-2 leading-relaxed">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
