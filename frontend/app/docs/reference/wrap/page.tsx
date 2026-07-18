import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "wrap() Context - Aurex SDK",
  description: "Request-scoped budget overrides and metadata via wrap() and awrap().",
};

const pythonWrapCode = `res = auditor.wrap(
    call_fn=openai.chat.completions.create,
    build_params=lambda: {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Process request"}],
    },
    options={
        "workflow_id": "tenant_abc",
        "budget_guard": {"max_cost_per_session": 0.05, "on_budget_exceeded": "throw"},
        "downgrade_map": {"gpt-4o": "gpt-4o-mini"},
    },
)`;

const nodeWrapCode = `const response = await auditor.wrap(
  (params) => openai.chat.completions.create(params),
  () => ({ model: "gpt-4o", messages: [{ role: "user", content: "Process request" }] }),
  {
    workflowId: "tenant_abc",
    budgetGuard: { maxCostPerSession: 0.05, onBudgetExceeded: "throw" },
    downgradeMap: { "gpt-4o": "gpt-4o-mini" },
  },
);`;

export default function DocsWrapPage() {
  return (
    <DocPageShell
      title="Context Overrides & wrap()"
      description="Override budget guards, downgrade maps, and workflow metadata per call using contextvars (Python) or AsyncLocalStorage (Node)."
      agentHint="Use for multi-tenant wrap(), per-request budget_guard overrides, and avoiding global config mutation."
      scopeIn={["wrap() / awrap()", "Per-request budget_guard", "downgrade_map overrides"]}
      scopeOut={["patch_all double-counting - see Harness Matrix", "Resilience retry - see Reliability"]}
    >
      <DualCodeBlock
        pythonCode={pythonWrapCode}
        nodeCode={nodeWrapCode}
        pythonId="copy-py-wrap"
        nodeId="copy-node-wrap"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/harness/decision-matrix", label: "Harness Matrix" },
          { href: "/docs/reference/budget-guard", label: "BudgetGuard" },
          { href: "/docs/reference/integration", label: "Manual Integration" },
        ]}
      />
    </DocPageShell>
  );
}
