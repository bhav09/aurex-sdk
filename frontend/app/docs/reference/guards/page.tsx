import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Real-Time Guards — Aurex SDK",
  description: "pre_call_check decision engine for downgrade, compress, and block actions.",
};

const pythonGuardsCode = `from aurex_sdk import AurexAuditor, AurexDecision

auditor = AurexAuditor()

decision: AurexDecision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Generate python code...",
    workflow_id="user_session_123",
)

if decision.action == "block":
    raise Exception(f"Blocked: {decision.reason}")
elif decision.action == "downgrade":
    model = decision.suggested_model
elif decision.action == "compress":
    messages = decision.compressed_messages`;

const nodeGuardsCode = `const decision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Generate python code...",
  workflowId: "user_session_123",
});

if (decision.action === "block") {
  throw new Error(\`Blocked: \${decision.reason}\`);
}`;

export default function DocsGuardsPage() {
  return (
    <DocPageShell
      title="Real-Time Guards"
      description="Evaluate calls against cost efficiency and runaway policies locally. Returns an AurexDecision without network I/O."
      agentHint="Use for pre_call_check / preCallCheck, proceed/downgrade/compress/block actions."
      scopeIn={["pre_call_check API", "Decision actions", "auditor.ignore()"]}
      scopeOut={["BudgetGuard config table — see BudgetGuard", "wrap() — see Context Wrappers"]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {[
          { action: "proceed", desc: "No violation; call proceeds normally." },
          { action: "downgrade", desc: "Swap to a cheaper suggested model." },
          { action: "compress", desc: "Prune duplicate system prompts from context." },
          { action: "block", desc: "Halt call when budget or policy violated." },
        ].map((row) => (
          <div key={row.action} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.01]">
            <code className="text-teal-400 font-mono">{row.action}</code>
            <p className="text-white/45 text-xs mt-1">{row.desc}</p>
          </div>
        ))}
      </div>

      <DualCodeBlock
        pythonCode={pythonGuardsCode}
        nodeCode={nodeGuardsCode}
        pythonId="copy-py-guards"
        nodeId="copy-node-guards"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/reference/budget-guard", label: "BudgetGuard" },
          { href: "/docs/reference/wrap", label: "wrap()" },
          { href: "/docs/reference/config", label: "AurexConfig" },
        ]}
      />
    </DocPageShell>
  );
}
