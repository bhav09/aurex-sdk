import Link from "next/link";
import { Layers } from "lucide-react";
import { DocHubCards, type HubCard } from "@/components/docs/doc-hub-cards";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";
import { Bot } from "lucide-react";
import { Grid3X3 } from "lucide-react";

export const metadata = {
  title: "Integration Patterns - Aurex SDK",
  description: "Choose your integration style: auto-patch, wrap, or manual logging.",
};

const cards: HubCard[] = [
  {
    href: "/docs/harness/decision-matrix",
    title: "Decision Matrix",
    description: "Pick patch vs wrap vs manual log_event based on your stack.",
    icon: Grid3X3,
  },
  {
    href: "/docs/reference/wrap",
    title: "wrap() Reference",
    description: "Full harness with request-scoped options.",
    icon: Layers,
  },
  {
    href: "/docs/reference/integration",
    title: "Manual log_event",
    description: "Partial harness at your wrapper boundary.",
    icon: Layers,
  },
];

export default function DocsHarnessHubPage() {
  return (
    <div className="space-y-8">
      <DocHashRedirect />
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Layers className="w-7 h-7 text-teal-400" />
          Integration Patterns
        </h1>
        <p className="text-white/50 mt-2">Choose your integration style: auto-patch for zero-code setup, wrap for request-scoped control, or manual logging for full flexibility.</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <p className="text-sm text-white/60">
          If you patch and wrap the same call path, events will be logged twice. Use{" "}
          <Link href="/docs/reference/health" className="text-teal-400">
            health output
          </Link>{" "}
          to verify your setup.
        </p>
      </div>

      <DocHubCards cards={cards} />
    </div>
  );
}
