import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { CodeBlock } from "@/components/docs/code-block";
import { Cloud, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Cloud Deployment — Aurex SDK",
  description: "Deploy Aurex in serverless, containers, and multi-worker environments.",
};

const pythonServerless = `# AWS Lambda / Cloud Functions — flush before returning
from aurex_sdk import AurexAuditor

auditor = AurexAuditor()

def handler(event, context):
    # ... your LLM work ...
    auditor.flush()
    return {"statusCode": 200}`;

const nodeServerless = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

export async function handler(event) {
  // ... your LLM work ...
  await auditor.flushAndWait();
  return { statusCode: 200 };
}`;

const pythonReadonly = `# Read-only filesystem (common in Lambda): auto-fallback chain
# 1) configured ledger_path  2) /tmp/.aurex  3) memory-only mode
auditor = AurexAuditor(AurexConfig(
    ledger_path=".aurex/ledger.jsonl",
    storage_mode="file",
    per_process_ledger=True,  # avoids cross-worker file contention
))`;

const nodeReadonly = `const auditor = AurexAuditor.getInstance({
  ledgerPath: ".aurex/ledger.jsonl",
  perProcessLedger: true,
  maxQueueSize: 10000,
});`;

export default function DocsDeploymentPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Cloud className="w-7 h-7 text-emerald-400" />
          Cloud Deployment Guide
        </h1>
        <p className="text-white/50 mt-2">
          Integration patterns for serverless handlers, read-only filesystems, bounded in-memory queues, and backend
          rate limits.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-white/60">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p>
          Cloud sync is asynchronous. Always call <code className="text-indigo-400">flush()</code> /{" "}
          <code className="text-indigo-400">flushAndWait()</code> at the end of short-lived handlers so events reach{" "}
          <code className="text-indigo-400">POST /api/v1/ledger/events</code> before the process freezes.
        </p>
      </div>

      <section id="serverless-flush" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Serverless flush</h2>
        <DualCodeBlock
          pythonCode={pythonServerless}
          nodeCode={nodeServerless}
          pythonId="serverless-py"
          nodeId="serverless-node"
        />
      </section>

      <section id="readonly-fs" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Read-only filesystem & multi-worker</h2>
        <p className="text-white/50 text-sm leading-relaxed">
          When the configured ledger directory is not writable, the SDK falls back to <code>/tmp/.aurex</code> and
          finally to memory-only storage (with a one-time warning). Set <code>AUREX_LEDGER_PATH</code> explicitly in
          locked-down environments. Enable <code>per_process_ledger</code> when multiple workers share a volume.
        </p>
        <DualCodeBlock
          pythonCode={pythonReadonly}
          nodeCode={nodeReadonly}
          pythonId="readonly-py"
          nodeId="readonly-node"
        />
      </section>

      <section id="network-resilience" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Network resilience</h2>
        <p className="text-white/50 text-sm">
          Cloud sync uses bounded timeouts, retries with jitter, and respects HTTP 429 <code>Retry-After</code> headers.
          Monitor <code>get_health()</code> / <code>getHealth()</code> for <code>sync_error_count</code> and{" "}
          <code>events_dropped</code>.
        </p>
        <CodeBlock
          id="health-check"
          language="python"
          code={`health = auditor.get_health()
# {
#   "status": "healthy" | "degraded",
#   "queue_size": 0,
#   "events_dropped": 0,
#   "sync_error_count": 0,
#   "storage_mode": "file",
#   "ledger_path": "/tmp/.aurex/ledger.12345.jsonl"
# }`}
        />
      </section>

      <section id="rate-limits" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Backend rate limits</h2>
        <p className="text-white/50 text-sm">
          Ledger ingest is rate-limited per API key (600 events/minute by default). Escalation webhooks accept either
          dashboard JWTs or SDK API keys (<code>aux_*</code>).
        </p>
      </section>

      <section id="environment-matrix" className="scroll-mt-32 space-y-3">
        <h2 className="text-xl font-semibold text-white">Environment matrix</h2>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/[0.03] text-white/60">
              <tr>
                <th className="p-3 font-medium">Environment</th>
                <th className="p-3 font-medium">Recommended settings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              <tr>
                <td className="p-3 text-white/80">AWS Lambda</td>
                <td className="p-3 text-white/50">
                  <code>AUREX_LEDGER_PATH=/tmp/.aurex/ledger.jsonl</code>, call flush at handler end
                </td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Kubernetes (N replicas)</td>
                <td className="p-3 text-white/50">
                  <code>per_process_ledger=true</code>, cloud_sync on, monitor queue_size in health
                </td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Vercel / Edge</td>
                <td className="p-3 text-white/50">
                  Prefer cloud_sync with memory storage; avoid filesystem assumptions
                </td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Docker / VM</td>
                <td className="p-3 text-white/50">
                  Mount writable volume at <code>.aurex/</code>, use SIGTERM handler + flushAndWait
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
