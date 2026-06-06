import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Backend Rate Limits — Aurex SDK",
  description: "Per-API-key ledger ingest rate limits and escalation authentication.",
};

export default function DocsRateLimitsPage() {
  return (
    <DocPageShell
      title="Backend Rate Limits"
      description="Ledger ingest is rate-limited per API key. The SDK retries on HTTP 429 using Retry-After."
      agentHint="Use when ingest returns 429 or events queue grows — default ~600 events/minute per key."
      scopeIn={["Ingest rate limit per key", "SDK 429 retry behavior", "Escalation endpoint auth"]}
      scopeOut={["Cloud sync health fields — see Cloud Sync Resilience"]}
    >
      <ul className="space-y-2 text-sm text-white/50 list-disc list-inside">
        <li>
          <code className="text-teal-400">POST /api/v1/ledger/events</code> — ~600 events/minute per API key (default).
        </li>
        <li>SDK respects <code>Retry-After</code> and applies exponential backoff with jitter.</li>
        <li>
          <code className="text-teal-400">POST /api/v1/escalations</code> accepts dashboard JWTs or SDK keys (
          <code>aux_*</code>).
        </li>
      </ul>

      <DocSeeAlso
        links={[
          { href: "/docs/deployment/cloud-sync", label: "Cloud Sync Resilience" },
          { href: "/docs/reference/config", label: "AurexConfig" },
        ]}
      />
    </DocPageShell>
  );
}
