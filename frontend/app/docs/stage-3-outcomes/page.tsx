import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Stage 3: Outcome Cost, Soft-Failure Gate & CI Diff — Aurex",
  description: "Measure verified cost per completed task, catch HTTP-200 soft failures, protect tenant margins, and diff PRs in CI.",
};

export default function Stage3OutcomesPage() {
  return (
    <DocPageShell
      title="Stage 3: After the Call + CI (Outcome & Soft-Failure Gate)"
      description="Turn raw token logs into verified cost-per-outcome metrics and catch regressions on every Pull Request."
      agentHint="Call mark_success(workflow_id) when tasks finish, tag tenant_id for SaaS margin guardrails, and run `aurex ci --baseline` in GitHub Actions."
    >
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">1. What problems are people facing?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Billed HTTP-200 soft failures:</strong> Models return HTTP <code>200 OK</code> with empty thinking-exhausted text or <code>\n\n\n</code> / repeated-key JSON loops that still bill full output rates.</li>
          <li><strong>Price-per-token illusion:</strong> Switching to a cheaper or quantized model looks cheaper per token, yet often doubles retry turns—quietly raising your real cost per resolved ticket.</li>
          <li><strong>SaaS flat-seat margin bleed:</strong> A handful of heavy power tenants on flat monthly plans can wipe out gross margins across your customer base.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">2. What does Aurex solve?</h2>
        <p className="text-sm text-white/65 leading-relaxed">
          Aurex automatically tags empty thinking-exhausted responses and JSON/whitespace grammar loops as <code>unfulfilled_spend</code>, strictly separates workflow <code>mark_success()</code> signals from per-call retries in SQL to compute true <strong>cost per successful outcome</strong> and <strong>turns per success</strong>, syncs per-tenant margin downgrades via <code>/api/v1/policies</code>, and posts a Markdown cost diff on Pull Requests.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. How to use it (Step-by-Step)</h2>

        <p className="text-sm font-medium text-teal-400">Step 1: Mark workflow outcomes &amp; tag SaaS tenants</p>
        <DualCodeBlock
          pythonId="s3-step1-py"
          nodeId="s3-step1-node"
          pythonCode={`# Tag tenant_id so /api/v1/policies can auto-downgrade over-budget tenants
auditor.log_event(
    model="claude-sonnet-4",
    input_tokens=1800,
    output_tokens=250,
    workflow_id="ticket-99",
    tags={"tenant_id": "acme-corp"},
)

# Record when the end-user task actually succeeded (or failed)
auditor.mark_success("ticket-99")`}
          nodeCode={`// Tag tenant_id so /api/v1/policies can auto-downgrade over-budget tenants
auditor.logEvent({
  model: "claude-sonnet-4",
  inputTokens: 1800,
  outputTokens: 250,
  workflowId: "ticket-99",
  tags: { tenant_id: "acme-corp" },
});

// Record when the end-user task actually succeeded (or failed)
auditor.markSuccess("ticket-99");`}
        />

        <p className="text-sm font-medium text-teal-400">Step 2: Diff Pull Requests against your main baseline in CI</p>
        <DualCodeBlock
          pythonId="s3-step2-py"
          nodeId="s3-step2-node"
          pythonTitle="Python CLI"
          nodeTitle="Node.js CLI"
          pythonCode={`# Warn-first PR Markdown table (exits 0 by default)
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment

# Hard-fail CI if cost_per_success, >200k cliffs, or cache hit % regresses
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --fail-on-regression`}
          nodeCode={`# Warn-first PR Markdown table (exits 0 by default)
npx aurex ci --ledger=.aurex/ledger.jsonl --baseline=main_ledger.jsonl --github-comment

# Hard-fail CI if costPerSuccess, >200k cliffs, or cache hit % regresses
npx aurex ci --ledger=.aurex/ledger.jsonl --baseline=main_ledger.jsonl --fail-on-regression`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">4. How can you improve your setup?</h2>
        <ul className="list-disc list-inside text-sm text-white/65 space-y-1.5">
          <li><strong>Watch <code>turns_per_success</code> by host:</strong> Use the dashboard&apos;s host quality breakdown to spot aggregator quantization drift when retry turns spike on a specific provider.</li>
          <li><strong>Set a tenant monthly cap:</strong> Configure <code>default_tenant_monthly_limit_usd</code> via <code>PUT /api/v1/policies</code> so heavy tenants gracefully route to mini/flash models instead of failing hard.</li>
          <li><strong>Save your <code>main</code> test ledger as a CI artifact:</strong> Pass it to <code>--baseline</code> on every PR so prompt regressions are caught before merge.</li>
        </ul>
      </section>

      <DocSeeAlso
        links={[
          { href: "/docs/reference", label: "Config & Provider Reference" },
          { href: "/docs/stage-2-breaker", label: "Stage 2: Spend, Thinking & Stream Breaker" },
        ]}
      />
    </DocPageShell>
  );
}
