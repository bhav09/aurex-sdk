import Link from "next/link";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "AurexConfig — Aurex SDK",
  description: "Core AurexConfig and getInstance options for Python and Node.js SDKs.",
};

export default function DocsConfigPage() {
  return (
    <DocPageShell
      title="AurexConfig"
      description="Configure the auditor singleton. Provider-call resilience uses the separate resilience key — see ResiliencePolicy."
      agentHint="Use for api_key, ledger_path, cloud_sync, flush intervals, storage_mode, and pricing paths."
      scopeIn={["Core sync and ledger options", "Pricing and heuristic thresholds", "Link to resilience policy"]}
      scopeOut={["BudgetGuard fields — see BudgetGuard", "ResiliencePolicy fields — see /docs/reliability/policy"]}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Python</th>
              <th className="p-3 font-semibold">Node.js</th>
              <th className="p-3 font-semibold">Default</th>
              <th className="p-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
            <tr>
              <td className="p-3 text-teal-400">api_key</td>
              <td className="p-3 text-teal-400">apiKey</td>
              <td className="p-3">None</td>
              <td className="p-3 font-sans">Project API key; enables cloud sync.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">project</td>
              <td className="p-3 text-teal-400">project</td>
              <td className="p-3">&quot;default&quot;</td>
              <td className="p-3 font-sans">Logical project label.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">ledger_path</td>
              <td className="p-3 text-teal-400">ledgerPath</td>
              <td className="p-3">.aurex/ledger.jsonl</td>
              <td className="p-3 font-sans">Local JSONL ledger path.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">per_process_ledger</td>
              <td className="p-3 text-teal-400">perProcessLedger</td>
              <td className="p-3">True</td>
              <td className="p-3 font-sans">Append worker suffix; set False in unit tests.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">cloud_sync</td>
              <td className="p-3 text-teal-400">cloudSync</td>
              <td className="p-3">False / auto</td>
              <td className="p-3 font-sans">Background POST to /ledger/events.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">base_url</td>
              <td className="p-3 text-teal-400">baseUrl</td>
              <td className="p-3">localhost API</td>
              <td className="p-3 font-sans">Backend REST base URL.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">local_only</td>
              <td className="p-3 text-teal-400">localOnly</td>
              <td className="p-3">True</td>
              <td className="p-3 font-sans">Skip cloud even if key is set.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">storage_mode</td>
              <td className="p-3 text-teal-400">storageMode</td>
              <td className="p-3">&quot;file&quot;</td>
              <td className="p-3 font-sans">file or memory (auto-fallback if FS unwritable).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">flush_interval_seconds</td>
              <td className="p-3 text-teal-400">flushIntervalMs</td>
              <td className="p-3">30s / 30000ms</td>
              <td className="p-3 font-sans">Background flush interval.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_batch_size</td>
              <td className="p-3 text-teal-400">maxBatchSize</td>
              <td className="p-3">100</td>
              <td className="p-3 font-sans">Events per upload batch.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">max_queue_size</td>
              <td className="p-3 text-teal-400">maxQueueSize</td>
              <td className="p-3">10000</td>
              <td className="p-3 font-sans">Bounded in-memory queue.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">sync_timeout_seconds</td>
              <td className="p-3 text-teal-400">syncTimeoutMs</td>
              <td className="p-3">10s / 10000ms</td>
              <td className="p-3 font-sans">HTTP timeout per sync attempt.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">sync_max_retries</td>
              <td className="p-3 text-teal-400">syncMaxRetries</td>
              <td className="p-3">3</td>
              <td className="p-3 font-sans">Cloud sync retries with jitter.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">sync_prompt_hashes</td>
              <td className="p-3 text-teal-400">syncPromptHashes</td>
              <td className="p-3">False</td>
              <td className="p-3 font-sans">Include prompt hashes in cloud payload.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">pricing_path</td>
              <td className="p-3 text-teal-400">pricingPath</td>
              <td className="p-3">None</td>
              <td className="p-3 font-sans">Custom pricing JSON path.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">default_pricing</td>
              <td className="p-3 text-teal-400">defaultPricing</td>
              <td className="p-3">1.50 / 6.00</td>
              <td className="p-3 font-sans">USD per 1M tokens fallback.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">budget_guard</td>
              <td className="p-3 text-teal-400">budgetGuard</td>
              <td className="p-3">{"{}"}</td>
              <td className="p-3 font-sans">
                Spend circuit breaker — see{" "}
                <Link href="/docs/reference/budget-guard" className="text-teal-400">
                  BudgetGuard
                </Link>
                .
              </td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">resilience</td>
              <td className="p-3 text-teal-400">resilience</td>
              <td className="p-3">enabled: false</td>
              <td className="p-3 font-sans">
                Provider-call retry/fallback — see{" "}
                <Link href="/docs/reliability/policy" className="text-teal-400">
                  ResiliencePolicy
                </Link>
                .
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/installation/env-vars", label: "Environment Variables" },
          { href: "/docs/reference/budget-guard", label: "BudgetGuard" },
          { href: "/docs/reliability/policy", label: "ResiliencePolicy" },
        ]}
      />
    </DocPageShell>
  );
}
