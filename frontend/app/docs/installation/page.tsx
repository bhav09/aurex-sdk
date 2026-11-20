import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocSeeAlso } from "@/components/docs/doc-see-also";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";

export const metadata = {
  title: "Quickstart & Installation — Aurex SDK",
  description: "Install Aurex in Python or Node.js in three simple steps.",
};

export default function InstallationPage() {
  return (
    <DocPageShell
      title="Quickstart & Installation"
      description="Start protecting OpenAI, Anthropic, Gemini, LiteLLM, and Llama calls in under two minutes."
      agentHint="Install aurex-sdk, call patch_all() / auditor.patchAll() once at app startup, and flush() before serverless exit."
    >
      <DocHashRedirect />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">1. What problems are people facing?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li>Routing LLM traffic through an external proxy adds network latency, creates a single point of failure, and exposes raw prompts outside your VPC.</li>
          <li>Manually wrapping dozens of SDK calls across an existing codebase takes days to maintain.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">2. What does Aurex solve?</h2>
        <p className="text-sm text-white/65 leading-relaxed">
          Aurex patches your installed provider SDKs directly in memory. All guards run locally in under a millisecond, prompts are SHA-256 hashed locally (never stored in plain text), and telemetry writes to <code>.aurex/ledger.jsonl</code> or syncs asynchronously to your Aurex project.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. How to use it (Step-by-Step)</h2>

        <p className="text-sm font-medium text-teal-400">Step 1: Install the package</p>
        <DualCodeBlock
          pythonId="inst-step1-py"
          nodeId="inst-step1-node"
          pythonCode={`pip install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry extras:
pip install "aurex-sdk[redis,otel]"`}
          nodeCode={`npm install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry peers:
npm install ioredis @opentelemetry/api`}
        />

        <p className="text-sm font-medium text-teal-400">Step 2: Initialize once at startup</p>
        <DualCodeBlock
          pythonId="inst-step2-py"
          nodeId="inst-step2-node"
          pythonCode={`from aurex_sdk import AurexAuditor, AurexConfig, patch_all

auditor = AurexAuditor(AurexConfig(
    api_key="aux_live_...",  # Omit for 100% local-only mode
    budget_guard={"max_cost_per_session": 2.00, "on_budget_exceeded": "throw"},
))
patch_all(auditor)`}
          nodeCode={`import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  apiKey: process.env.AUREX_API_KEY, // Omit for 100% local-only mode
  budgetGuard: { maxCostPerSession: 2.0, onBudgetExceeded: "throw" },
});
await auditor.patchAll();
auditor.instrument(OpenAI); // Explicit hook for Next.js Turbopack / Vite bundlers`}
        />

        <p className="text-sm font-medium text-teal-400">Step 3: Or enable Zero-Code Auto-Hook (no code edits)</p>
        <DualCodeBlock
          pythonId="inst-step3-py"
          nodeId="inst-step3-node"
          pythonCode={`aurex install-hook
export AUREX_ENABLED=1
export AUREX_API_KEY="aux_live_..."
python app.py`}
          nodeCode={`npx aurex install-hook
source .env.aurex
export AUREX_API_KEY="aux_live_..."
node server.js`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">4. How can you improve your setup?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Serverless / Lambda:</strong> Call <code>auditor.flush()</code> (Python) or <code>await auditor.flushAndWait()</code> (Node.js) before handler exit so queued events are never lost.</li>
          <li><strong>Read-only containers:</strong> Set <code>storage_mode=&quot;memory&quot;</code> / <code>storageMode: &quot;memory&quot;</code> when running on read-only container filesystems.</li>
          <li><strong>Pass <code>workflow_id</code>:</strong> Tag user tickets or agent runs with <code>workflow_id</code> so Stage 1, 2, and 3 track sessions accurately.</li>
        </ul>
      </section>

      <DocSeeAlso
        links={[
          { href: "/docs/stage-1-shield", label: "Next — Stage 1: Prefix & Cliff Shield" },
          { href: "/docs/reference", label: "Config & Environment Variables" },
        ]}
      />
    </DocPageShell>
  );
}
