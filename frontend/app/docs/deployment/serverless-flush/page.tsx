import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Serverless Flush — Aurex SDK",
  description: "Flush telemetry before Lambda and short-lived handlers return.",
};

const pythonServerless = `from aurex_sdk import AurexAuditor

auditor = AurexAuditor()

def handler(event, context):
    # ... LLM work ...
    auditor.flush()
    return {"statusCode": 200}`;

const nodeServerless = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

export async function handler(event) {
  // ... LLM work ...
  await auditor.flushAndWait();
  return { statusCode: 200 };
}`;

export default function DocsServerlessFlushPage() {
  return (
    <DocPageShell
      title="Serverless Flush"
      description="Background sync may not finish before a frozen Lambda or Edge runtime. Flush explicitly at handler end."
      agentHint="Use when deploying to Lambda, Cloud Functions, or Vercel — call flush() or await flushAndWait()."
      scopeIn={["flush() Python", "flushAndWait() Node", "Handler exit pattern"]}
      scopeOut={["Ledger path on read-only FS — see Filesystem", "HTTP retry — see Cloud Sync"]}
    >
      <DualCodeBlock
        pythonCode={pythonServerless}
        nodeCode={nodeServerless}
        pythonId="serverless-py"
        nodeId="serverless-node"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/deployment/filesystem", label: "Filesystem & Ledger" },
          { href: "/docs/deployment/cloud-sync", label: "Cloud Sync Resilience" },
          { href: "/docs/reference/health", label: "Health & Recovery" },
        ]}
      />
    </DocPageShell>
  );
}
