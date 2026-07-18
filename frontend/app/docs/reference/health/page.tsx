import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Health & Status - Aurex SDK",
  description: "Runtime health, sync status, and recovery state.",
};

const pythonHealthCode = `health = auditor.get_health()
# status, queue_size, events_dropped, sync_error_count,
# patch_status, storage_mode, ledger_path, pending_file_exists`;

const nodeHealthCode = `const health = auditor.getHealth();
// status, queueSize, eventsDropped, syncErrorCount,
// patchStatus, storageMode, ledgerPath`;

export default function DocsHealthPage() {
  return (
    <DocPageShell
      title="Health & Status"
      description="Inspect runtime health, sync status, and recovery state. Events buffered during crashes are replayed automatically on next startup."
      agentHint="Use for get_health / getHealth, events_dropped, patch_status, and pending file recovery."
      scopeIn={["Health dict fields", "Crash durability via pending.jsonl", "patch_status visibility"]}
      scopeOut={["Cloud sync config - see Cloud Sync", "Serverless flush - see Serverless"]}
    >
      <p className="text-white/50 text-sm">
        On unclean shutdown, events spill to <code className="text-teal-400">pending.jsonl</code> and replay on next
        startup.
      </p>

      <DualCodeBlock
        pythonCode={pythonHealthCode}
        nodeCode={nodeHealthCode}
        pythonId="copy-py-health"
        nodeId="copy-node-health"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/deployment/cloud-sync", label: "Cloud Sync Resilience" },
          { href: "/docs/deployment/serverless-flush", label: "Serverless Flush" },
          { href: "/docs/harness/decision-matrix", label: "Harness Matrix" },
        ]}
      />
    </DocPageShell>
  );
}
