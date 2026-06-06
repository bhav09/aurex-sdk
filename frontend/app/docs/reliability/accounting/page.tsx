import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Loss Accounting — Aurex SDK",
  description: "projected_cost, loss_avoided, ingest fields, and dashboard reliability metrics.",
};

export default function DocsAccountingPage() {
  return (
    <DocPageShell
      title="Loss Accounting"
      description="Counterfactual metrics quantify spend that would have been wasted without recovery, and billed-but-failed spend you still pay providers for."
      agentHint="Use for loss_avoided, projected_cost, UNFULFILLED_SPEND, dashboard billed_but_failed_cost, migration 002."
      scopeIn={["SDK log_event fields", "Ingest payload fields", "Dashboard overview metrics", "DB migration note"]}
      scopeOut={["ResiliencePolicy tuning — see Policy"]}
    >
      <h2 className="text-lg font-semibold text-white">SDK event fields</h2>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-left font-mono text-xs text-white/60">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/80 font-sans text-sm">
              <th className="p-3">Field</th>
              <th className="p-3 font-sans">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <tr>
              <td className="p-3 text-teal-400">outcome</td>
              <td className="p-3 font-sans">success | failure | recovered | degraded</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">cost_type</td>
              <td className="p-3 font-sans">Includes unfulfilled_spend for billed-but-unusable calls</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">projected_cost</td>
              <td className="p-3 font-sans">Estimated cost if primary route had succeeded</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">loss_avoided</td>
              <td className="p-3 font-sans">Counterfactual savings from recovery (in extra_metadata too)</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">recovery_provider</td>
              <td className="p-3 font-sans">Provider used after fallback/retry</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">attempt_index</td>
              <td className="p-3 font-sans">0-based attempt number</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">status / error_code / latency_ms / finish_reason</td>
              <td className="p-3 font-sans">Provider response metadata for analytics</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold text-white">Dashboard overview</h2>
      <ul className="space-y-1 text-sm text-white/50 list-disc list-inside">
        <li>
          <code className="text-teal-400">billed_but_failed_cost</code> — spend on unfulfilled/degraded outcomes
        </li>
        <li>
          <code className="text-teal-400">loss_avoided</code> — aggregated counterfactual recovery value
        </li>
        <li>
          <code className="text-teal-400">recovery_rate</code> — share of recoverable failures successfully retried
        </li>
        <li>
          Savings timeline includes category <code className="text-teal-400">reliability_savings</code>
        </li>
      </ul>

      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-white/60">
        <p className="font-medium text-white mb-1">Backend migration</p>
        <p>
          Run <code className="text-teal-400">python -m scripts.migrate_002_reliability_fields</code> on your deploy
          database before relying on reliability dashboard columns.
        </p>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/overview", label: "Overview" },
          { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce" },
          { href: "/docs/reference/outcomes", label: "Outcomes" },
        ]}
      />
    </DocPageShell>
  );
}
