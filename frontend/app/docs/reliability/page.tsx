import Link from "next/link";
import { Shield, Bot } from "lucide-react";
import { DocHubCards, type HubCard } from "@/components/docs/doc-hub-cards";
import { Eye, Sliders, GitBranch, Tags, Calculator, BookOpen } from "lucide-react";

export const metadata = {
  title: "Reliability & Loss Recovery — Aurex SDK",
  description: "Provider-call resilience, billed-but-failed accounting, and observe vs enforce modes.",
};

const cards: HubCard[] = [
  {
    href: "/docs/reliability/overview",
    title: "Overview",
    description: "Billed-but-failed spend, in-process library model, rollout path.",
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
    title: "Loss Accounting",
    description: "loss_avoided, projected_cost, dashboard metrics.",
    icon: Calculator,
  },
];

export default function DocsReliabilityHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Shield className="w-7 h-7 text-teal-400" />
          Reliability & Loss Recovery
        </h1>
        <p className="text-white/50 mt-2">
          Provider-call resilience — retry, fallback, and counterfactual loss accounting. Default off until{" "}
          <code className="text-teal-400">resilience.enabled=true</code>.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <p className="text-sm text-white/60">
          Not cloud sync retry — see{" "}
          <Link href="/docs/deployment/cloud-sync" className="text-teal-400">
            Cloud Sync Resilience
          </Link>
          . Not BudgetGuard — see{" "}
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
