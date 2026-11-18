import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Stage 2: Session Spend, Thinking & Stream Circuit Breaker — Aurex",
  description: "Hard dollar caps, thinking-token clamping, aborted-stream tracking, and multi-worker loop protection.",
};

export default function Stage2BreakerPage() {
  return (
    <DocPageShell
      title="Stage 2: During the Call (Spend, Thinking & Stream Breaker)"
      description="Trip a live circuit breaker before a looping agent, reasoning model, or retry storm drains your budget."
      agentHint="Set budget_guard (max_cost_per_session, max_thinking_tokens), enable_loop_guard=True, and AUREX_REDIS_URL for multi-worker pods."
    >
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">1. What problems are people facing?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>No hard session kill-switch:</strong> Cloud billing alerts arrive hours late, and unscoped agents collide or loop on failing tool calls across workers.</li>
          <li><strong>Hidden thinking-token spikes:</strong> Reasoning models (<code>o3</code>, Claude extended thinking, Gemini <code>thoughts_token_count</code>) bill thousands of internal tokens at full output rates—and downgrading to a smaller model crashes with HTTP <code>400</code> if reasoning params aren&apos;t stripped.</li>
          <li><strong>Blind streaming &amp; retry storms:</strong> Streaming calls omit token usage by default, client disconnects lose partial spend, and nested retries multiply <code>429</code> traffic <code>6x</code>.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">2. What does Aurex solve?</h2>
        <p className="text-sm text-white/65 leading-relaxed">
          Aurex isolates every session automatically (via explicit <code>workflow_id</code>, async context, or active OpenTelemetry <code>trace_id</code>), tracks live spend across pods via optional Redis, clamps thinking budgets, strips incompatible reasoning params on downgrade, injects <code>stream_options.include_usage</code>, logs aborted streams in <code>try...finally</code>, sets native SDK <code>max_retries=0</code> when resilience is active, and prices hosted Llama endpoints (Groq, Together, Fireworks) accurately vs. <code>$0</code> local Ollama.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. How to use it (Step-by-Step)</h2>
        <DualCodeBlock
          pythonId="s2-py"
          nodeId="s2-node"
          pythonCode={`from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all

auditor = AurexAuditor(AurexConfig(
    redis_url="redis://localhost:6379/0",  # Optional shared multi-pod state
    enable_loop_guard=True,
    resilience={"enabled": True, "mode": "enforce", "max_attempts": 2},
    budget_guard={
        "max_cost_per_session": 1.50,
        "max_cost_per_minute": 10.00,
        "max_thinking_tokens": 4096,
        "on_budget_exceeded": "throw",
    },
))
patch_all(auditor)

try:
    # Works across OpenAI Chat, client.responses.create, Anthropic, Gemini & Groq
    ...
except AurexBlocked as err:
    print("Stopped runaway agent:", err.reason)`}
          nodeCode={`import { AurexAuditor, AurexBlocked } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  redisUrl: process.env.AUREX_REDIS_URL, // Optional shared multi-pod state
  enableLoopGuard: true,
  resilience: { enabled: true, mode: "enforce", max_attempts: 2 },
  budgetGuard: {
    maxCostPerSession: 1.5,
    maxCostPerMinute: 10.0,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
});
auditor.patchAll();

try {
  // Works across OpenAI Chat, client.responses.create, Anthropic, Gemini & Groq
} catch (err) {
  if (err instanceof AurexBlocked) console.error("Stopped runaway agent:", err.reason);
}`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">4. How can you improve your setup?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Cap thinking tokens early:</strong> Set <code>max_thinking_tokens: 4096</code> so reasoning models cannot burn 32k output tokens on routine requests.</li>
          <li><strong>Enable Redis in production:</strong> Point <code>AUREX_REDIS_URL</code> at your existing Redis/Valkey instance so all Kubernetes pods enforce one shared session cap.</li>
          <li><strong>Start in warn/dry-run mode:</strong> Set <code>dry_run: True</code> / <code>dryRun: true</code> on day one to observe limits in logs before switching to <code>&quot;throw&quot;</code>.</li>
        </ul>
      </section>

      <DocSeeAlso
        links={[
          { href: "/docs/stage-3-outcomes", label: "Next — Stage 3: Outcome Cost & CI Gate" },
          { href: "/docs/stage-1-shield", label: "Stage 1: Prefix & Cliff Shield" },
        ]}
      />
    </DocPageShell>
  );
}
