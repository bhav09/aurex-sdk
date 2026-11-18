import Link from "next/link";
import { Shield, Zap, BarChart3, Rocket, BookOpen, ArrowRight } from "lucide-react";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";

export const metadata = {
  title: "Aurex Documentation — Before, During & After Every LLM Call",
  description: "Plain-English guide to preventing LLM token waste in Python and Node.js with zero proxy latency.",
};

const guides = [
  {
    href: "/docs/installation",
    title: "Quickstart & Install",
    description: "Install in 60 seconds with 2 lines of code or zero-code auto-hook.",
    icon: Rocket,
  },
  {
    href: "/docs/stage-1-shield",
    title: "Stage 1: Before the Call",
    description: "Keep 90% prompt-cache discounts warm and stop >200k 2x context cliff surprises.",
    icon: Shield,
  },
  {
    href: "/docs/stage-2-breaker",
    title: "Stage 2: During the Call",
    description: "Session-isolated dollar caps, thinking-token limits, and live stream accounting.",
    icon: Zap,
  },
  {
    href: "/docs/stage-3-outcomes",
    title: "Stage 3: After the Call + CI",
    description: "Track cost per completed task, catch HTTP-200 soft failures, and diff PRs in CI.",
    icon: BarChart3,
  },
  {
    href: "/docs/reference",
    title: "Config & Providers",
    description: "All AurexConfig fields, BudgetGuard options, environment variables, and providers.",
    icon: BookOpen,
  },
];

export default function DocsOverviewPage() {
  return (
    <div className="space-y-10">
      <DocHashRedirect />

      <div>
        <h1 className="text-4xl font-display font-bold tracking-tight text-white mb-3">
          Aurex SDK Documentation
        </h1>
        <p className="text-white/60 leading-relaxed">
          Aurex protects your AI bill inside your own process—adding <strong>0 ms proxy latency</strong> and never sending raw prompt text outside your servers.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-semibold text-white">1. What problems are people facing?</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-white/65">
          <li><strong>Silent cache & cliff traps:</strong> Dynamic timestamps break 90% prompt-cache discounts, and crossing <code>200k</code> tokens doubles whole-request pricing on Claude and Gemini.</li>
          <li><strong>Runaway runtime spend:</strong> Looping agents, 25,000 hidden thinking tokens, aborted streams, and multiplied SDK retries burn budget mid-run.</li>
          <li><strong>Billed soft failures:</strong> Empty or looped HTTP <code>200 OK</code> outputs still cost money while hiding true cost per completed task.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-semibold text-white">2. What does Aurex solve?</h2>
        <p className="text-sm text-white/65 leading-relaxed">
          One lightweight SDK connects three stages around every OpenAI, Anthropic, Gemini, LiteLLM, or Llama call: <strong>Stage 1</strong> shields your prefix cache and warns before pricing cliffs, <strong>Stage 2</strong> enforces live session and thinking-token circuit breakers across workers, and <strong>Stage 3</strong> measures real cost per outcome and flags cost regressions on Pull Requests.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-semibold text-white">3. How to use it (60-second setup)</h2>
        <DualCodeBlock
          pythonId="overview-py"
          nodeId="overview-node"
          pythonTitle="Python (pip install aurex-sdk)"
          nodeTitle="Node.js (npm install aurex-sdk)"
          pythonCode={`from aurex_sdk import AurexAuditor, AurexConfig, patch_all
import openai

auditor = AurexAuditor(AurexConfig(
    budget_guard={"max_cost_per_session": 1.00, "max_thinking_tokens": 4096, "on_budget_exceeded": "throw"},
    enable_loop_guard=True,
))
patch_all(auditor)

client = openai.OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize this ticket."}],
    workflow_id="ticket-42",
)
auditor.mark_success("ticket-42")
auditor.flush()`}
          nodeCode={`import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: { maxCostPerSession: 1.0, maxThinkingTokens: 4096, onBudgetExceeded: "throw" },
  enableLoopGuard: true,
});
auditor.patchAll();

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize this ticket." }],
  metadata: { workflow_id: "ticket-42" },
});
auditor.markSuccess("ticket-42");
auditor.flush();`}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-semibold text-white">4. Explore the 3-Stage Pipeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {guides.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="group p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-teal-500/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <g.icon className="w-4 h-4 text-teal-400" />
                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-teal-400 transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{g.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{g.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
