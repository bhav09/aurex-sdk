import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog — Aurex",
  description:
    "Latest updates to the Aurex token waste prevention platform. SDK releases, new detection capabilities, and platform improvements.",
};

const entries = [
  {
    date: "2026-06-04",
    version: "v0.3.0",
    title: "Infinite loop detection upgrade — F1 0.08 → 0.72",
    category: "SDK",
    description:
      "Upgraded infinite loop detection from structural-only heuristic (F1 ≈ 0.08) to hybrid structural + semantic detection (F1 ≈ 0.72). The new implementation adds three detection layers: exact hash matching for identical tool calls, context growth threshold for runaway expansion, and semantic fuzzy detection using cosine similarity for rephrased repetition. Based on techniques from arXiv:2511.10650.",
    highlights: [
      "3-layer detection: exact hash, context growth, semantic similarity",
      "30-second cooldown after loop detection to prevent double-tripping",
      "Per-session mutable state — never persisted, no privacy impact",
      "Backward compatible — existing structural checks preserved",
    ],
  },
  {
    date: "2026-06-04",
    version: "v0.3.0",
    title: "patch_all() multi-provider support",
    category: "SDK",
    description:
      "The existing patch_all() method now auto-detects and patches all installed LLM provider libraries with a single call. Previously only OpenAI was reliably auto-patched. Now supports OpenAI, Anthropic, Google Generative AI, LiteLLM, Ollama, and Hugging Face out of the box.",
    highlights: [
      "Idempotent — safe to call multiple times",
      "Fail-open — patching failures log warnings but never break LLM calls",
      "Returns dict of {provider: was_patched} for introspection",
      "patch_openai() preserved as backward-compatible alias",
    ],
  },
  {
    date: "2026-06-04",
    version: "v0.3.0",
    title: "Prompt optimization — caching opportunity detection",
    category: "SDK",
    description:
      "New prompt optimization signal detects calls where the system prompt is identical across sessions (matched by token count + SHA-256 hash) and the provider supports prompt caching but no cache header was sent. Calculates estimated monthly savings at the provider's cached rate.",
    highlights: [
      "Supports Anthropic (90% savings), OpenAI (50% savings), Google (75% savings)",
      "Only flags prompts appearing 5+ times in 30 days",
      "Ignores trivial savings under $0.10/month",
      "Two additional signals: prompt drift tracking and CoT inflation detection",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background text-white selection:bg-emerald-500/30">
      <Navigation />
      <div className="max-w-[900px] mx-auto px-6 lg:px-12 pt-28 pb-24">
        {/* Header */}
        <div className="mb-16">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-6">
            <span className="w-12 h-px bg-white/20" />
            Changelog
          </span>
          <h1 className="text-5xl sm:text-6xl font-display tracking-tight leading-[0.9] text-white mb-4">
            What&apos;s new
          </h1>
          <p className="text-lg text-white/50 max-w-xl">
            Latest updates to the Aurex platform. Subscribe to releases on{" "}
            <a
              href="https://github.com/heyaurex/aurex-sdk"
              className="text-[#eca8d6] hover:text-[#eca8d6]/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </div>

        {/* Entries */}
        <div className="space-y-0">
          {entries.map((entry, index) => (
            <div
              key={`${entry.version}-${entry.title}`}
              className={`relative pl-8 pb-16 ${
                index < entries.length - 1
                  ? "border-l border-white/[0.08]"
                  : "border-l border-transparent"
              }`}
            >
              {/* Timeline dot */}
              <div className="absolute left-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full bg-[#eca8d6] border-4 border-background" />

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-xs font-mono text-white/30">
                  {entry.date}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-white/[0.04] border border-white/[0.08] rounded text-white/50">
                  {entry.version}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-[#eca8d6]/10 border border-[#eca8d6]/20 rounded text-[#eca8d6]/70">
                  {entry.category}
                </span>
              </div>

              {/* Content */}
              <h2 className="text-xl sm:text-2xl font-display text-white mb-3">
                {entry.title}
              </h2>
              <p className="text-sm text-white/45 leading-relaxed mb-4">
                {entry.description}
              </p>

              {/* Highlights */}
              <ul className="space-y-2">
                {entry.highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="flex items-start gap-2 text-sm text-white/35"
                  >
                    <span className="text-[#eca8d6]/50 mt-1 shrink-0">•</span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <FooterSection />
    </div>
  );
}
