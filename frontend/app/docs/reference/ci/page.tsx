import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "CI Policy Gate - Aurex SDK",
  description: "Enforce cost and efficiency policies in your CI pipeline.",
};

export default function DocsCiPage() {
  return (
    <DocPageShell
      title="CI Policy Gate"
      description="Run heuristics in CI and enforce cost and efficiency policies before merging. Supports warn and block modes."
      agentHint="Use for npx aurex ci, --mode warn|block, --github-comment, and Python audit --mode block."
      scopeIn={["CI flags and exit codes", "GitHub comment output"]}
      scopeOut={["Heuristic categories - see Heuristics CLI"]}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Flag</th>
              <th className="p-3 font-semibold">Default</th>
              <th className="p-3 font-semibold">Behavior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
            <tr>
              <td className="p-3 text-teal-400">--mode warn</td>
              <td className="p-3 font-sans">Default</td>
              <td className="p-3 font-sans">Print report; exit 0.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">--mode block</td>
              <td className="p-3">-</td>
              <td className="p-3 font-sans">Exit 1 when policies violated.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">--github-comment</td>
              <td className="p-3">-</td>
              <td className="p-3 font-sans">Markdown suitable for PR comments (Node).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">--fail-under</td>
              <td className="p-3 font-sans">Python</td>
              <td className="p-3 font-sans">Minimum efficiency score.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">--max-waste-usd</td>
              <td className="p-3 font-sans">Python</td>
              <td className="p-3 font-sans">Maximum detected waste USD.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reference/heuristics", label: "Heuristics CLI" },
          { href: "/docs/reference/integration", label: "Manual Integration" },
        ]}
      />
    </DocPageShell>
  );
}
