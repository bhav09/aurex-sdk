import Link from "next/link";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Reliability Overview - Aurex SDK",
  description: "How Aurex handles provider failures automatically, in-process.",
};

export default function DocsReliabilityOverviewPage() {
  return (
    <DocPageShell
      title="Reliability Overview"
      description="Aurex classifies provider outcomes, retries or falls back automatically, and tracks the cost difference. Runs in-process using your API keys and your registered callables."
      agentHint="Use when explaining how Aurex handles provider failures, why it's not a hosted gateway, or observe→enforce rollout."
      scopeIn={["Architecture", "In-process library model", "Phased rollout: default off → observe → enforce"]}
      scopeOut={["ResiliencePolicy field table - see Policy", "register_fallback API - see Fallbacks"]}
    >
      <div className="space-y-4 text-sm text-white/50 leading-relaxed">
        <p>
          <strong className="text-white">Aurex is an in-process library</strong>, not a hosted LLM gateway. Retries and
          fallbacks run inside your application using <strong className="text-white">your API keys</strong> and{" "}
          <strong className="text-white">customer-registered callables</strong>.
        </p>
        <p>
          By default <code className="text-teal-400">resilience.enabled=false</code> - no behavior change until you
          opt in. Recommended rollout:
        </p>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            <strong className="text-white">Observe</strong> - classify failures and emit counterfactual{" "}
            <code>loss_avoided</code> without retrying.
          </li>
          <li>
            <strong className="text-white">Enforce</strong> - bounded retry/fallback with{" "}
            <code>max_extra_cost_usd</code> ceiling.
          </li>
        </ol>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] text-sm text-white/50">
        <p className="font-medium text-white mb-2">Flow (enforce mode)</p>
        <pre className="text-xs font-mono text-white/45 whitespace-pre-wrap">{`LLM call → classify response/exception
  → if retryable and under cost cap → retry or fallback callable
  → log_event with outcome, projected_cost, loss_avoided
  → cloud sync → dashboard reliability metrics`}</pre>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/policy", label: "ResiliencePolicy" },
          { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce" },
          { href: "/docs/reference/budget-guard", label: "BudgetGuard (different)" },
        ]}
      />
    </DocPageShell>
  );
}
