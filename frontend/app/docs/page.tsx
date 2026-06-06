import Link from "next/link";
import { Cpu, Cloud, Layers, BookOpen, ArrowRight, Bot, Rocket, Shield } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = {
  title: "Aurex SDK Documentation",
  description:
    "Token waste prevention SDK. Install, auto-patch all providers, and start preventing wasted tokens in under two minutes.",
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
    description: "Serverless flush, filesystem fallbacks, cloud sync resilience, and ingest rate limits.",
    icon: Cloud,
  },
  {
    href: "/docs/harness",
    title: "Harness Integration",
    description: "Choose patch vs wrap vs manual logging based on your observability stack.",
    icon: Layers,
  },
  {
    href: "/docs/reference",
    title: "API Reference",
    description: "Focused pages for config, guards, providers, health, and CI — one topic per URL.",
    icon: BookOpen,
  },
  {
    href: "/docs/reliability",
    title: "Reliability & Loss Recovery",
    description: "Provider-call retry, fallbacks, observe/enforce modes, and loss_avoided accounting.",
    icon: Shield,
  },
];

export default function DocsOverviewPage() {
  return (
    <div className="space-y-10">
      {/* Quickstart block */}
      <div id="quickstart" className="scroll-mt-32">
        <div className="flex items-center gap-2 mb-4">
          <Rocket className="w-5 h-5 text-amber-400" />
          <h2 className="text-2xl font-display font-bold text-white">Quickstart</h2>
          <span className="ml-2 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 rounded text-amber-400">
            2 minutes
          </span>
        </div>

        <CodeBlock
          language="BASH"
          code={"pip install aurex-sdk"}
        />
        
        <CodeBlock
          language="PYTHON"
          code={`from aurex_sdk import AurexAuditor, patch_all
import openai

# 1. Initialize and patch (no manual logging required)
auditor = AurexAuditor()
patch_all()

# 2. Use your LLM library exactly as before
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain quantum entanglement."}]
)

# 3. Check your Token Credit Score
score = auditor.get_score()
print(f"Token Credit Score: {score.value}/100")
# => Token Credit Score: 84/100
# => Flags: ['cache_opportunity: $12.40/month saving on system prompt']`}
        />

        {/* Privacy note */}
        <div className="flex items-start gap-3 mt-4 p-4 rounded-xl border border-teal-500/10 bg-teal-500/[0.02]">
          <Shield className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-white/50">
              <span className="text-white/70 font-medium">No data leaves your machine by default.</span>{" "}
              Cloud sync is opt-in. The ledger file at <code className="text-teal-400/70 text-xs">~/.aurex/ledger.jsonl</code> is
              human-readable JSON and can be inspected at any time. It contains only numeric metadata — never raw prompt text.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-mono text-teal-400 uppercase tracking-wider">SDK v0.3</span>
        </div>
        <h1 className="text-4xl font-display font-bold tracking-tight text-white mb-3">
          Aurex SDK Documentation
        </h1>
        <p className="text-white/50 max-w-2xl leading-relaxed">
          Aurex is a token waste prevention platform. The SDK sits in-process between your application code and LLM provider APIs,
          intercepting and preventing the four root causes of AI token waste before a single wasted token is billed.
          Budget guards and detection heuristics run locally without adding network latency.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-white">Agent-friendly docs</h2>
          <p className="text-xs text-white/40 mt-1">
            Start at{" "}
            <Link href="/llms.txt" className="text-teal-400 hover:text-teal-300">
              /llms.txt
            </Link>{" "}
            for task → URL routing. Fetch one page per concern (e.g.{" "}
            <Link href="/docs/reference/config" className="text-teal-400 hover:text-teal-300">
              /docs/reference/config
            </Link>
            ,{" "}
            <Link href="/docs/reliability/policy" className="text-teal-400 hover:text-teal-300">
              /docs/reliability/policy
            </Link>
            ) — avoid loading hub pages for implementation detail.
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
            <card.icon className="w-5 h-5 text-teal-400 mb-3" />
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {card.title}
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-teal-400" />
            </h2>
            <p className="text-sm text-white/45 mt-2 leading-relaxed">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
