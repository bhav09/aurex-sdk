import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Outcomes - Aurex SDK",
  description: "Record workflow success and failure for cost-efficiency analytics.",
};

const pythonOutcomesCode = `auditor.mark_success("checkout_agent", {"ticket_id": "T-123"})
auditor.mark_failure("checkout_agent", "timeout", {"retries": 3})`;

const nodeOutcomesCode = `auditor.markSuccess("checkout_agent", { ticketId: "T-123" });
auditor.markFailure("checkout_agent", "timeout", { retries: 3 });`;

export default function DocsOutcomesPage() {
  return (
    <DocPageShell
      title="Success & Failure Signals"
      description="Register logical workflow outcomes once per operation - token counts alone do not reveal task success."
      agentHint="Use for mark_success / markSuccess and mark_failure / markFailure after workflow completion."
      scopeIn={["Workflow outcome API", "Optional metadata dict"]}
      scopeOut={["Resilience attempt logging - see Loss Accounting"]}
    >
      <DualCodeBlock
        pythonCode={pythonOutcomesCode}
        nodeCode={nodeOutcomesCode}
        pythonId="copy-py-outcomes"
        nodeId="copy-node-outcomes"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/reference/integration", label: "Manual Integration" },
          { href: "/docs/reliability/accounting", label: "Loss Accounting" },
        ]}
      />
    </DocPageShell>
  );
}
