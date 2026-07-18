import {
  Terminal,
  Code,
  Sliders,
  ShieldCheck,
  BookOpen,
  Zap,
  Target,
  Info,
  Flame,
  RefreshCw,
} from "lucide-react";
import { DocHubCards, type HubCard } from "@/components/docs/doc-hub-cards";
import Link from "next/link";
import { Bot } from "lucide-react";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";

export const metadata = {
  title: "API Reference - Aurex SDK",
  description: "Focused API reference pages for configuration, guards, providers, and CLI tools.",
};

const cards: HubCard[] = [
  {
    href: "/docs/reference/autohook",
    title: "Zero-Code Auto-Hook",
    description: "Install runtime hooks without modifying application code.",
    icon: Terminal,
  },
  {
    href: "/docs/reference/integration",
    title: "Integration",
    description: "Initialize, patch providers, and manage the runtime lifecycle.",
    icon: Code,
  },
  {
    href: "/docs/reference/config",
    title: "AurexConfig",
    description: "Core configuration fields for Python and Node.js.",
    icon: Sliders,
  },
  {
    href: "/docs/reference/budget-guard",
    title: "BudgetGuard",
    description: "Set spending and rate limits that are enforced automatically, in-process.",
    icon: ShieldCheck,
  },
  {
    href: "/docs/reference/providers",
    title: "Supported Providers",
    description: "Auto-patch coverage matrix by SDK and provider.",
    icon: BookOpen,
  },
  {
    href: "/docs/reference/guards",
    title: "Runtime Guards",
    description: "Evaluate each call before it’s sent - route, compress, or block.",
    icon: Zap,
  },
  {
    href: "/docs/reference/wrap",
    title: "wrap() Context",
    description: "Request-scoped budget and metadata overrides.",
    icon: Sliders,
  },
  {
    href: "/docs/reference/outcomes",
    title: "Outcomes",
    description: "Workflow success and failure signals.",
    icon: Target,
  },
  {
    href: "/docs/reference/health",
    title: "Health & Status",
    description: "Runtime health, recovery state, and sync status.",
    icon: Info,
  },
  {
    href: "/docs/reference/heuristics",
    title: "Heuristics CLI",
    description: "Analyze your ledger for optimization opportunities.",
    icon: Flame,
  },
  {
    href: "/docs/reference/ci",
    title: "CI Policy Gate",
    description: "Enforce cost and efficiency policies in your CI pipeline.",
    icon: RefreshCw,
  },
];

export default function DocsReferenceHubPage() {
  return (
    <div className="space-y-8">
      <DocHashRedirect />
      <div>
        <h1 className="text-3xl font-display font-bold text-white">API Reference</h1>
        <p className="text-white/50 mt-2">
          Each topic lives on its own page. Pick the one that matches what you’re building.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <p className="text-sm text-white/60">
          Agents: use{" "}
          <Link href="/llms.txt" className="text-teal-400 hover:text-teal-300">
            /llms.txt
          </Link>{" "}
          to route tasks to a single URL below.
        </p>
      </div>

      <DocHubCards cards={cards} />
    </div>
  );
}
