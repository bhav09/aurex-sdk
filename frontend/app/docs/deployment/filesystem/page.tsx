import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Filesystem & Ledger — Aurex SDK",
  description: "Read-only filesystem fallbacks, AUREX_LEDGER_PATH, and per_process_ledger.",
};

const pythonReadonly = `from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    ledger_path=".aurex/ledger.jsonl",
    storage_mode="file",
    per_process_ledger=True,  # avoids cross-worker contention
))`;

const nodeReadonly = `const auditor = AurexAuditor.getInstance({
  ledgerPath: ".aurex/ledger.jsonl",
  perProcessLedger: true,
  maxQueueSize: 10000,
});`;

export default function DocsFilesystemPage() {
  return (
    <DocPageShell
      title="Filesystem & Ledger"
      description="When the configured ledger directory is not writable, the SDK falls back to /tmp/.aurex then memory-only storage."
      agentHint="Use for AUREX_LEDGER_PATH, per_process_ledger, storage_mode file vs memory."
      scopeIn={["Fallback chain: configured path → /tmp → memory", "Multi-worker ledger suffix", "AUREX_WORKER_ID"]}
      scopeOut={["Cloud sync retries — see Cloud Sync Resilience"]}
    >
      <DualCodeBlock
        pythonCode={pythonReadonly}
        nodeCode={nodeReadonly}
        pythonId="readonly-py"
        nodeId="readonly-node"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/installation/env-vars", label: "Environment Variables" },
          { href: "/docs/deployment/serverless-flush", label: "Serverless Flush" },
          { href: "/docs/reference/config", label: "AurexConfig" },
        ]}
      />
    </DocPageShell>
  );
}
