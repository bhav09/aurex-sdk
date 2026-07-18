import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "ResiliencePolicy - Aurex SDK",
  description: "resilience configuration under AurexConfig for Python and Node.js.",
};

const pythonConfig = `from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    resilience={
        "enabled": True,
        "mode": "observe",
        "timeout_ms": 60000,
        "max_attempts": 2,
        "max_extra_cost_usd": 0.05,
        "retry_on": ["timeout", "429", "5xx", "network", "empty"],
        "idempotency": "auto",
        "proof_window_pct": 0.0,
    },
))`;

const nodeConfig = `const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  resilience: {
    enabled: true,
    mode: "observe",
    timeoutMs: 60000,
    maxAttempts: 2,
    maxExtraCostUsd: 0.05,
    retryOn: ["timeout", "429", "5xx", "network", "empty"],
    idempotency: "auto",
    proofWindowPct: 0.0,
  },
});`;

export default function DocsReliabilityPolicyPage() {
  return (
    <DocPageShell
      title="ResiliencePolicy"
      description="Configure provider-call resilience under the resilience key on AurexConfig."
      agentHint="Use for resilience.enabled, mode, max_attempts, max_extra_cost_usd, retry_on, backoff, idempotency."
      scopeIn={["All ResiliencePolicy fields", "Minimal config example"]}
      scopeOut={["Mode semantics - see Observe vs Enforce", "Fallback registration - see Fallbacks"]}
    >
      <DualCodeBlock pythonCode={pythonConfig} nodeCode={nodeConfig} pythonId="rel-config-py" nodeId="rel-config-node" />

      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Field</th>
              <th className="p-3 font-semibold">Default</th>
              <th className="p-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
            <tr>
              <td className="p-3 text-teal-400">enabled</td>
              <td className="p-3">false</td>
              <td className="p-3 font-sans">Master switch; false = passthrough.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">mode</td>
              <td className="p-3">observe</td>
              <td className="p-3 font-sans">observe | enforce</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">timeout_ms</td>
              <td className="p-3">60000</td>
              <td className="p-3 font-sans">Per-attempt wall-clock cap.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_attempts</td>
              <td className="p-3">2</td>
              <td className="p-3 font-sans">Including initial call; enforce only.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_extra_cost_usd</td>
              <td className="p-3">0.05</td>
              <td className="p-3 font-sans">Cap on additional spend for retries/fallbacks.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">retry_on</td>
              <td className="p-3">see Classification</td>
              <td className="p-3 font-sans">List of failure kinds eligible for retry.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">backoff</td>
              <td className="p-3">base 200ms</td>
              <td className="p-3 font-sans">base_ms, max_ms, jitter for enforce retries.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">idempotency</td>
              <td className="p-3">auto</td>
              <td className="p-3 font-sans">auto | require_key | off</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">fallbacks</td>
              <td className="p-3">[]</td>
              <td className="p-3 font-sans">Named fallback chain (see Fallbacks page).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">proof_window_pct</td>
              <td className="p-3">0.0</td>
              <td className="p-3 font-sans">Sample enforce retries in observe for proof (0–1).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">on_recovery</td>
              <td className="p-3">None</td>
              <td className="p-3 font-sans">Optional callback after successful recovery.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">classify_response_override</td>
              <td className="p-3">None</td>
              <td className="p-3 font-sans">Custom classifier hook (Python).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce" },
          { href: "/docs/reliability/classification", label: "Classification" },
          { href: "/docs/reference/config", label: "AurexConfig" },
        ]}
      />
    </DocPageShell>
  );
}
