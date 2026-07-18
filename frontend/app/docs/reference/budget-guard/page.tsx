import Link from "next/link";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "BudgetGuard - Aurex SDK",
  description: "Set spending and rate limits that are enforced automatically, in-process.",
};

export default function DocsBudgetGuardPage() {
  return (
    <DocPageShell
      title="BudgetGuard"
      description="Set spending and rate limits that are enforced automatically, in-process. Evaluated locally with zero network latency."
      agentHint="Use for max_cost_per_minute, max_cost_per_session, on_budget_exceeded throw/warn/webhook."
      scopeIn={["budget_guard / budgetGuard config", "Per-wrap() overrides", "AurexBudgetExceeded"]}
      scopeOut={["Provider retry/fallback - see Reliability docs", "Backend ingest rate limits - see Rate Limits"]}
    >
      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-white/60 mb-4">
        <strong className="text-white">Separate from provider reliability.</strong> BudgetGuard enforces spending limits before calls are sent.
        Provider-call retry and fallbacks are configured under{" "}
        <Link href="/docs/reliability/overview" className="text-teal-400">
          Reliability
        </Link>
        .
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Python</th>
              <th className="p-3 font-semibold">Node.js</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
            <tr>
              <td className="p-3 text-teal-400">max_cost_per_minute</td>
              <td className="p-3 text-teal-400">maxCostPerMinute</td>
              <td className="p-3">float</td>
              <td className="p-3 font-sans">Max USD spend per rolling 60s.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_cost_per_session</td>
              <td className="p-3 text-teal-400">maxCostPerSession</td>
              <td className="p-3">float</td>
              <td className="p-3 font-sans">Max USD per workflow_id.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_requests_per_minute</td>
              <td className="p-3 text-teal-400">maxRequestsPerMinute</td>
              <td className="p-3">integer</td>
              <td className="p-3 font-sans">Request count cap per minute.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_context_tokens</td>
              <td className="p-3 text-teal-400">maxContextTokens</td>
              <td className="p-3">integer</td>
              <td className="p-3 font-sans">Estimated input token cap.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">on_budget_exceeded</td>
              <td className="p-3 text-teal-400">onBudgetExceeded</td>
              <td className="p-3">string</td>
              <td className="p-3 font-sans">throw | warn | webhook</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">webhook_url</td>
              <td className="p-3 text-teal-400">webhookUrl</td>
              <td className="p-3">string</td>
              <td className="p-3 font-sans">Webhook destination when configured.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">dry_run</td>
              <td className="p-3 text-teal-400">dryRun</td>
              <td className="p-3">boolean</td>
              <td className="p-3 font-sans">Evaluate without blocking.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reference/wrap", label: "wrap() overrides" },
          { href: "/docs/reference/guards", label: "Real-Time Guards" },
          { href: "/docs/reliability/overview", label: "Provider Resilience" },
        ]}
      />
    </DocPageShell>
  );
}
