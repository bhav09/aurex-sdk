import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Stage 1: Prefix Cache-Shield & 200k Cliff Guard — Aurex",
  description: "Keep 90% prompt-cache discounts intact and avoid 2x whole-request context pricing cliffs.",
};

export default function Stage1ShieldPage() {
  return (
    <DocPageShell
      title="Stage 1: Before the Call (Prefix & 200k Cliff Shield)"
      description="Stop paying full price to resend static prompts and catch 2x context surcharges before requests fire."
      agentHint="Keep messages[0] static; Aurex auto-sorts tool/schema JSON keys, pinpoints prefix-breaking offsets, checks >5m TTL gaps, and warns near 200k tokens."
    >
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">1. What problems are people facing?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Silent prefix-cache breakers:</strong> OpenAI, Claude, and Gemini give 50%–90% discounts on repeated prompt prefixes, but changing a single timestamp at character 20 or shuffling JSON dictionary keys resets cache hits to <code>0</code>.</li>
          <li><strong>Anthropic 5-minute TTL trap:</strong> Waiting just over 5 minutes between turns expires the default cache and charges a <code>1.25x</code> cache-rewrite penalty.</li>
          <li><strong>The 200k 2x pricing cliff:</strong> Sending <code>200,001</code> input tokens to 1M-context Claude 4+ or Gemini 2.5+ models doubles the rate on <em>all</em> 200,001 tokens—not just the extra token.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">2. What does Aurex solve?</h2>
        <p className="text-sm text-white/65 leading-relaxed">
          Before every request leaves your app, Aurex deterministically sorts JSON keys in <code>tools</code> and <code>response_format</code>, hashes your prompt layers (<code>system</code> → <code>context</code> → <code>history</code>) to report the exact character offset that mutated, flags <code>&gt;5m</code> idle gaps, and calculates exact <code>tiktoken</code> + 2x cliff costs for Stage 2&apos;s budget guard. Any runtime Aurex guidance is appended at the <strong>tail</strong> of <code>messages</code> so index <code>0</code> caches never break.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. How to use it (Step-by-Step)</h2>
        <p className="text-sm text-white/65">
          Stage 1 runs automatically inside <code>patch_all()</code> / <code>patchAll()</code> and <code>pre_call_check()</code>:
        </p>
        <DualCodeBlock
          pythonId="s1-py"
          nodeId="s1-node"
          pythonCode={`from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    cache_ttl="5m",  # or "1h" if using Anthropic extended cache TTL
    budget_guard={"max_context_tokens": 195000, "on_budget_exceeded": "throw"},
))

decision = auditor.pre_call_check(
    model="claude-sonnet-4",
    system_prompt="You are a legal reviewer. Today is 2026-11-18 10:05:01.",
    prompt="Summarize clause 4.",
    workflow_id="contract-review-7",
)
print(decision.warnings)
# Pinpoints mutating timestamp offset & warns when approaching 200,000 tokens`}
          nodeCode={`import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  cacheTtl: "5m", // or "1h"
  budgetGuard: { maxContextTokens: 195000, onBudgetExceeded: "throw" },
});

const decision = auditor.preCallCheck({
  model: "claude-sonnet-4",
  systemPrompt: "You are a legal reviewer. Today is 2026-11-18 10:05:01.",
  prompt: "Summarize clause 4.",
  workflowId: "contract-review-7",
});
console.log(decision.warnings);`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">4. How can you improve your setup?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Put dynamic values last:</strong> Move current dates, user names, and RAG snippets out of your top system prompt and into the final user message.</li>
          <li><strong>Cap context at 195k:</strong> Set <code>max_context_tokens: 195000</code> so long RAG threads summarize or stop before hitting the <code>200k</code> 2x price jump.</li>
          <li><strong>Match your Anthropic TTL:</strong> If human-in-the-loop chats pause for 10–30 minutes, switch long system prompts to <code>cache_ttl=&quot;1h&quot;</code> instead of paying repeated <code>1.25x</code> 5-minute rewrites.</li>
        </ul>
      </section>

      <DocSeeAlso
        links={[
          { href: "/docs/stage-2-breaker", label: "Next — Stage 2: Spend, Thinking & Stream Breaker" },
          { href: "/docs/reference", label: "Pricing & Config Reference" },
        ]}
      />
    </DocPageShell>
  );
}
