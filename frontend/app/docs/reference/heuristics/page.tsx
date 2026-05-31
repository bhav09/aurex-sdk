import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Heuristics CLI — Aurex SDK",
  description: "Offline ledger analysis for loops, waste, and context spikes.",
};

const pythonCliCode = `aurex audit --ledger .aurex/ledger.jsonl
aurex audit --fail-under 85 --max-waste-usd 5.00 --mode block`;

const nodeCliCode = `npx aurex ci
npx aurex ci --mode=block --github-comment`;

export default function DocsHeuristicsPage() {
  return (
    <DocPageShell
      title="Offline Heuristics CLI"
      description="Scan local ledger.jsonl without a database to detect loops, context spikes, and waste drivers."
      agentHint="Use for aurex audit CLI flags: --ledger, --fail-under, --max-waste-usd, --mode."
      scopeIn={["Python aurex audit", "Detected heuristic categories"]}
      scopeOut={["CI pipeline integration — see CI Policy Gate"]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-white/50">
        {[
          "System prompt duplication",
          "Agent runaway loops",
          "Expensive model misuse",
          "Context expansion ratios",
          "Semantic loop detection",
          "Retry cascade analytics",
        ].map((title) => (
          <div key={title} className="p-3 rounded-lg border border-white/[0.06]">
            {title}
          </div>
        ))}
      </div>

      <DualCodeBlock
        pythonCode={pythonCliCode}
        nodeCode={nodeCliCode}
        pythonId="copy-py-cli"
        nodeId="copy-node-cli"
        pythonTitle="Python audit"
        nodeTitle="Node ci (see CI page)"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/reference/ci", label: "CI Policy Gate" },
          { href: "/docs/reference/health", label: "Health & Recovery" },
        ]}
      />
    </DocPageShell>
  );
}
