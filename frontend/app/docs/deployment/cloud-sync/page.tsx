import { CodeBlock } from "@/components/docs/code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";
import Link from "next/link";

export const metadata = {
  title: "Cloud Sync Resilience — Aurex SDK",
  description: "HTTP retries, 429 Retry-After, and queue drop monitoring for ledger ingest.",
};

export default function DocsCloudSyncPage() {
  return (
    <DocPageShell
      title="Cloud Sync Resilience"
      description="Telemetry upload to POST /api/v1/ledger/events uses bounded timeouts, retries with jitter, and respects HTTP 429."
      agentHint="Use for sync_error_count, events_dropped, sync_max_retries — not provider LLM retry."
      scopeIn={["Cloud sync retry behavior", "Health fields for sync failures", "sync_timeout / syncMaxRetries config"]}
      scopeOut={["Provider-call retry/fallback — see /docs/reliability", "Backend rate limit numbers — see Rate Limits"]}
    >
      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] text-sm text-white/50">
        This is <strong className="text-white">cloud sync resilience</strong> (SDK → Aurex backend). Provider-call
        resilience (OpenAI → fallback model) is documented under{" "}
        <Link href="/docs/reliability/overview" className="text-indigo-400">
          Reliability & Loss Recovery
        </Link>
        .
      </div>

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

      <DocSeeAlso
        links={[
          { href: "/docs/reference/health", label: "Health & Recovery" },
          { href: "/docs/reference/config", label: "AurexConfig sync fields" },
          { href: "/docs/deployment/rate-limits", label: "Backend Rate Limits" },
        ]}
      />
    </DocPageShell>
  );
}
