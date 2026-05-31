import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Observe vs Enforce — Aurex SDK",
  description: "Detect-only resilience mode vs active retry with fail-open behavior.",
};

export default function DocsObserveEnforcePage() {
  return (
    <DocPageShell
      title="Observe vs Enforce"
      description="Observe classifies and accounts for loss without retrying. Enforce performs bounded retry and fallback under a cost ceiling."
      agentHint="Use when choosing resilience.mode, explaining fail-open, or proof_window_pct sampling."
      scopeIn={["observe semantics", "enforce semantics", "fail-open on auditor errors", "proof_window_pct"]}
      scopeOut={["Fallback registration — see Fallbacks", "Event fields — see Loss Accounting"]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <h2 className="font-semibold text-white mb-2">observe (default when enabled)</h2>
          <ul className="space-y-1 text-white/50 list-disc list-inside">
            <li>Single provider call — no automatic retry</li>
            <li>Classifies response/exception and logs counterfactual metrics</li>
            <li>Computes projected_cost and loss_avoided for analytics</li>
            <li>Safe for production shadow mode before enforce</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
          <h2 className="font-semibold text-white mb-2">enforce</h2>
          <ul className="space-y-1 text-white/50 list-disc list-inside">
            <li>Retries on retry_on kinds up to max_attempts</li>
            <li>Invokes registered fallbacks within max_extra_cost_usd</li>
            <li>Raises AurexResilienceExhausted when cap exceeded</li>
            <li>Raises AurexRecovered when a retry/fallback succeeds</li>
          </ul>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.06] text-sm text-white/50">
        <p className="font-medium text-white mb-1">Fail-open</p>
        <p>
          Resilience wraps provider calls fail-open: unexpected auditor errors propagate the original provider exception
          rather than masking failures. Observe mode never doubles calls on network errors.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.06] text-sm text-white/50">
        <p className="font-medium text-white mb-1">proof_window_pct</p>
        <p>
          When mode is observe and proof_window_pct &gt; 0, a random sample of calls run enforce logic for validation
          while the majority stay observe-only. Use briefly to validate fallback wiring before full enforce.
        </p>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/policy", label: "ResiliencePolicy" },
          { href: "/docs/reliability/fallbacks", label: "Fallbacks" },
          { href: "/docs/reliability/accounting", label: "Loss Accounting" },
        ]}
      />
    </DocPageShell>
  );
}
