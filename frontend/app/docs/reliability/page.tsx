import Link from "next/link";
import { Shield, Bot } from "lucide-react";
import { DocHubCards, type HubCard } from "@/components/docs/doc-hub-cards";
import { Eye, Sliders, GitBranch, Tags, Calculator, BookOpen } from "lucide-react";

export const metadata = {
  title: "Reliability - Aurex SDK",
  description: "Automatic retry, provider failover, and health-aware routing.",
};

const cards: HubCard[] = [
  {
    href: "/docs/reliability/overview",
    title: "Overview",
    description: "How Aurex handles provider failures automatically.",
    icon: BookOpen,
  },
  {
    href: "/docs/reliability/policy",
    title: "ResiliencePolicy",
    description: "resilience config under AurexConfig.",
    icon: Sliders,
  },
  {
    href: "/docs/reliability/observe-enforce",
    title: "Observe vs Enforce",
    description: "Detect-only vs active retry with cost ceiling.",
    icon: Eye,
  },
  {
    href: "/docs/reliability/fallbacks",
    title: "Fallbacks",
    description: "register_fallback with customer-owned clients.",
    icon: GitBranch,
  },
  {
    href: "/docs/reliability/classification",
    title: "Classification",
    description: "retry_on failure kinds and overrides.",
    icon: Tags,
  },
  {
    href: "/docs/reliability/accounting",
    title: "Cost Accounting",
    description: "Cost tracking, projected savings, and dashboard metrics.",
    icon: Calculator,
  },
];

export default function DocsReliabilityHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Shield className="w-7 h-7 text-teal-400" />
          Reliability
        </h1>
        <p className="text-white/50 mt-2">
          Automatic retry, provider failover, and health-aware routing. Off by default - enable with{" "}
          <code className="text-teal-400">resilience.enabled=true</code>.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <p className="text-sm text-white/60">
          This section covers provider-call reliability. For cloud sync, see{" "}
          <Link href="/docs/deployment/cloud-sync" className="text-teal-400">
            Cloud Sync
          </Link>
          . For spending limits, see{" "}
          <Link href="/docs/reference/budget-guard" className="text-teal-400">
            BudgetGuard
          </Link>
          .
        </p>
      </div>

      <DocHubCards cards={cards} />
    </div>
  );
}
