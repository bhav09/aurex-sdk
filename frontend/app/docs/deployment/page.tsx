import { Cloud, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { DocHubCards, type HubCard } from "@/components/docs/doc-hub-cards";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";
import { Server, HardDrive, Wifi, Gauge } from "lucide-react";

export const metadata = {
  title: "Cloud Deployment — Aurex SDK",
  description: "Deploy Aurex in serverless, containers, and multi-worker environments.",
};

const cards: HubCard[] = [
  {
    href: "/docs/deployment/serverless-flush",
    title: "Serverless Flush",
    description: "flush() and flushAndWait() before Lambda or Edge handlers return.",
    icon: Server,
  },
  {
    href: "/docs/deployment/filesystem",
    title: "Filesystem & Ledger",
    description: "Read-only FS fallbacks, AUREX_LEDGER_PATH, per_process_ledger.",
    icon: HardDrive,
  },
  {
    href: "/docs/deployment/cloud-sync",
    title: "Cloud Sync Resilience",
    description: "HTTP retries, 429 handling, queue drops — not provider-call retry.",
    icon: Wifi,
  },
  {
    href: "/docs/deployment/rate-limits",
    title: "Backend Rate Limits",
    description: "Per-key ingest limits and escalation auth.",
    icon: Gauge,
  },
];

export default function DocsDeploymentHubPage() {
  return (
    <div className="space-y-8">
      <DocHashRedirect />
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Cloud className="w-7 h-7 text-teal-400" />
          Cloud Deployment
        </h1>
        <p className="text-white/50 mt-2">
          Patterns for serverless handlers, read-only filesystems, cloud sync, and backend rate limits.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-white/60">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p>
          Cloud sync is asynchronous. Always flush before short-lived handlers exit. Provider-call retry lives under{" "}
          <Link href="/docs/reliability" className="text-teal-400">
            Reliability
          </Link>
          .
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <p className="text-sm text-white/60">Pick one deployment topic below — each page covers a single concern.</p>
      </div>

      <DocHubCards cards={cards} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Environment matrix</h2>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/[0.03] text-white/60">
              <tr>
                <th className="p-3 font-medium">Environment</th>
                <th className="p-3 font-medium">Recommended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-white/50">
              <tr>
                <td className="p-3 text-white/80">AWS Lambda</td>
                <td className="p-3">
                  <Link href="/docs/deployment/filesystem" className="text-teal-400">
                    AUREX_LEDGER_PATH=/tmp/...
                  </Link>
                  ,{" "}
                  <Link href="/docs/deployment/serverless-flush" className="text-teal-400">
                    flush at handler end
                  </Link>
                </td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Kubernetes</td>
                <td className="p-3">per_process_ledger, cloud_sync, monitor queue_size</td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Vercel / Edge</td>
                <td className="p-3">cloud_sync + memory storage; explicit flushAndWait</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
