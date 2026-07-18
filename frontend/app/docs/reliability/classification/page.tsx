import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Response Classification - Aurex SDK",
  description: "Failure kinds, retry_on list, and classify_response override.",
};

const defaultKinds = [
  { kind: "success", retry: "No", desc: "Usable response with content." },
  { kind: "timeout", retry: "Yes*", desc: "Wall-clock or client timeout." },
  { kind: "429", retry: "Yes*", desc: "Rate limited by provider." },
  { kind: "5xx", retry: "Yes*", desc: "Provider server error." },
  { kind: "network", retry: "Yes*", desc: "Connection reset, DNS, etc." },
  { kind: "empty", retry: "Yes*", desc: "Billed but empty content." },
  { kind: "content_filter", retry: "Yes*", desc: "Filtered finish_reason." },
  { kind: "truncated", retry: "Yes*", desc: "Truncated output." },
  { kind: "refusal", retry: "Yes*", desc: "Model refusal." },
  { kind: "tool_error", retry: "Yes*", desc: "Tool call failure." },
];

export default function DocsClassificationPage() {
  return (
    <DocPageShell
      title="Classification"
      description="Every provider response or exception is classified into a kind. retry_on filters which kinds trigger enforce-mode retry."
      agentHint="Use for retry_on list, billed-but-empty detection, classify_response_override hook."
      scopeIn={["Default retry_on kinds", "Billed vs usable distinction", "Custom classifier override"]}
      scopeOut={["Enforce cost cap - see Policy", "Fallback chain - see Fallbacks"]}
    >
      <p className="text-sm text-white/50">* Retry only when mode is enforce and kind is listed in retry_on.</p>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/80">
              <th className="p-3 font-medium">Kind</th>
              <th className="p-3 font-medium">Retry in enforce</th>
              <th className="p-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-white/50 text-xs">
            {defaultKinds.map((row) => (
              <tr key={row.kind}>
                <td className="p-3 font-mono text-teal-400">{row.kind}</td>
                <td className="p-3">{row.retry}</td>
                <td className="p-3 font-sans">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-white/50">
        Empty and content-filter responses are often still billed - observe mode records them as{" "}
        <code className="text-teal-400">UNFULFILLED_SPEND</code> for dashboard analytics.
      </p>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/policy", label: "ResiliencePolicy" },
          { href: "/docs/reliability/accounting", label: "Loss Accounting" },
          { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce" },
        ]}
      />
    </DocPageShell>
  );
}
