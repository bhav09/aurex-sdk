import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";

export const metadata = {
  title: "Config & Provider Reference — Aurex SDK",
  description: "Concise reference for AurexConfig, BudgetGuard, environment variables, and supported LLM providers.",
};

export default function ReferencePage() {
  return (
    <DocPageShell
      title="Config & Provider Reference"
      description="Single-page lookup for SDK configuration, budget guard limits, environment variables, and supported providers."
      agentHint="Python uses snake_case (max_cost_per_session); Node.js uses camelCase (maxCostPerSession)."
    >
      <DocHashRedirect />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">1. Core AurexConfig Options</h2>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left text-xs text-white/70">
            <thead className="bg-white/[0.04] text-white font-mono">
              <tr>
                <th className="p-3">Python / Node Key</th>
                <th className="p-3">Default</th>
                <th className="p-3">What It Does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr><td className="p-3 font-mono">api_key / apiKey</td><td className="p-3">env <code>AUREX_API_KEY</code></td><td className="p-3">Enables async cloud sync &amp; <code>/api/v1/policies</code> sync when set.</td></tr>
              <tr><td className="p-3 font-mono">storage_mode / storageMode</td><td className="p-3"><code>&quot;file&quot;</code></td><td className="p-3"><code>&quot;file&quot;</code> writes <code>.aurex/ledger.jsonl</code>; <code>&quot;memory&quot;</code> for read-only containers.</td></tr>
              <tr><td className="p-3 font-mono">redis_url / redisUrl</td><td className="p-3">env <code>AUREX_REDIS_URL</code></td><td className="p-3">Shares live session/minute spend &amp; prefix state across multi-worker pods.</td></tr>
              <tr><td className="p-3 font-mono">cache_ttl / cacheTtl</td><td className="p-3"><code>&quot;5m&quot;</code></td><td className="p-3">Anthropic cache write multiplier (<code>&quot;5m&quot;</code> = 1.25x, <code>&quot;1h&quot;</code> = 2.0x).</td></tr>
              <tr><td className="p-3 font-mono">enable_loop_guard / enableLoopGuard</td><td className="p-3"><code>false</code></td><td className="p-3">Blocks repeated tool/prompt loops cleanly with <code>AurexBlocked</code>.</td></tr>
              <tr><td className="p-3 font-mono">auto_downgrade_simple_prompts</td><td className="p-3"><code>false</code></td><td className="p-3">Routes short non-code prompts on frontier models to mini/flash/haiku tiers.</td></tr>
              <tr><td className="p-3 font-mono">resilience</td><td className="p-3">disabled</td><td className="p-3"><code>{`{ enabled: true, mode: "observe" | "enforce", max_attempts: 2 }`}</code>.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">2. BudgetGuard Options</h2>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left text-xs text-white/70">
            <thead className="bg-white/[0.04] text-white font-mono">
              <tr>
                <th className="p-3">Python / Node Key</th>
                <th className="p-3">What It Enforces</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr><td className="p-3 font-mono">max_cost_per_session / maxCostPerSession</td><td className="p-3">Hard USD cap per <code>workflow_id</code> (downgrades at 80%, blocks at 100%).</td></tr>
              <tr><td className="p-3 font-mono">max_cost_per_minute / maxCostPerMinute</td><td className="p-3">Sliding 60-second USD cap across all calls.</td></tr>
              <tr><td className="p-3 font-mono">max_requests_per_minute / maxRequestsPerMinute</td><td className="p-3">Sliding 60-second request rate cap.</td></tr>
              <tr><td className="p-3 font-mono">max_context_tokens / maxContextTokens</td><td className="p-3">Pre-call input token cap (set to <code>195000</code> to avoid <code>200k</code> 2x cliffs).</td></tr>
              <tr><td className="p-3 font-mono">max_thinking_tokens / maxThinkingTokens</td><td className="p-3">Clamps <code>thinking.budget_tokens</code> and lowers <code>reasoning_effort</code>.</td></tr>
              <tr><td className="p-3 font-mono">on_budget_exceeded / onBudgetExceeded</td><td className="p-3"><code>&quot;warn&quot;</code> (default), <code>&quot;throw&quot;</code> (raises <code>AurexBlocked</code>), or <code>&quot;webhook&quot;</code>.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">3. Supported Providers &amp; Endpoints</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>OpenAI &amp; OpenAI-Compatible Standard (<code>patch_openai</code> / <code>patchOpenAI</code>):</strong> Covers <code>chat.completions.create</code>, <code>responses.create</code>, streaming usage injection, and automatic <code>base_url</code> pricing detection for <strong>Groq</strong>, <strong>Together AI</strong>, <strong>Fireworks</strong>, <strong>OpenRouter</strong>, <strong>Azure</strong>, and local <strong>Ollama</strong> (<code>localhost:11434</code> = <code>$0.00</code>).</li>
          <li><strong>Anthropic (<code>patch_anthropic</code> / <code>patchAnthropic</code>):</strong> Tracks <code>cache_read_input_tokens</code>, <code>cache_creation_input_tokens</code> (<code>5m</code> vs <code>1h</code>), extended thinking caps, and <code>&gt;200k</code> 2x tiered pricing.</li>
          <li><strong>Google Gemini (<code>patch_google</code> / <code>patchGoogle</code>):</strong> Tracks <code>cached_content_token_count</code>, <code>thoughts_token_count</code> thinking tokens, and <code>&gt;200k</code> 2x tiered pricing.</li>
          <li><strong>LiteLLM &amp; Native Ollama / Hugging Face:</strong> Supported via <code>patch_litellm</code>, <code>patch_ollama</code>, and <code>patch_huggingface</code> (all included in <code>patch_all()</code>).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">4. Environment Variables</h2>
        <p className="text-xs font-mono text-white/65 leading-relaxed">
          AUREX_API_KEY • AUREX_BASE_URL • AUREX_REDIS_URL • AUREX_LEDGER_PATH • AUREX_WORKFLOW_ID • AUREX_CACHE_TTL • AUREX_ENABLED=1 • AUREX_BLOCK_ON_WASTE=1 • AUREX_DEBUG=1
        </p>
      </section>

      <DocSeeAlso
        links={[
          { href: "/docs/installation", label: "Quickstart & Installation" },
          { href: "/docs/stage-1-shield", label: "Stage 1: Prefix & Cliff Shield" },
          { href: "/docs/stage-2-breaker", label: "Stage 2: Spend & Stream Breaker" },
          { href: "/docs/stage-3-outcomes", label: "Stage 3: Outcome Cost & CI Gate" },
        ]}
      />
    </DocPageShell>
  );
}
