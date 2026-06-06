import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Environment Variables — Aurex SDK",
  description: "AUREX_* environment variables for API keys, ledger paths, and worker IDs.",
};

export default function DocsEnvVarsPage() {
  return (
    <DocPageShell
      title="Environment Variables"
      description="Canonical reference for AUREX_* variables. Prefer this page over duplicated env lists elsewhere."
      agentHint="Use for AUREX_API_KEY, AUREX_BASE_URL, AUREX_LEDGER_PATH, AUREX_WORKER_ID, AUREX_ENABLED."
      scopeIn={["All AUREX_* variables", "Serverless /tmp ledger override"]}
      scopeOut={["Full AurexConfig table — see AurexConfig page"]}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Variable</th>
              <th className="p-3 font-semibold">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
            <tr>
              <td className="p-3 text-teal-400">AUREX_API_KEY</td>
              <td className="p-3 font-sans">Project API key (aux_dev_*, aux_*, ax_live_*).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_BASE_URL</td>
              <td className="p-3 font-sans">Backend base URL. Default: http://localhost:8000/api/v1</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_ENABLED</td>
              <td className="p-3 font-sans">Set 1 for auto-hook activation.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_LEDGER_PATH</td>
              <td className="p-3 font-sans">Override ledger file (use /tmp/... in read-only/serverless).</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_WORKER_ID</td>
              <td className="p-3 font-sans">Suffix for per-process ledger filenames in multi-worker setups.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_WORKFLOW_ID</td>
              <td className="p-3 font-sans">Default workflow attribution for auto-hook events.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_SYNC_PROMPT_HASHES</td>
              <td className="p-3 font-sans">Set 1 to sync prompt/response hashes to cloud.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_PRICING_PATH</td>
              <td className="p-3 font-sans">Path to custom model pricing JSON.</td>
            </tr>
            <tr>
              <td className="p-3 text-teal-400">AUREX_DEBUG</td>
              <td className="p-3 font-sans">Set 1 for verbose SDK debug logs (Python).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/installation", label: "Installation" },
          { href: "/docs/deployment/filesystem", label: "Filesystem & Ledger" },
          { href: "/docs/reference/config", label: "AurexConfig" },
        ]}
      />
    </DocPageShell>
  );
}
