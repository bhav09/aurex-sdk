export type DocsNavItem = {
  href: string;
  label: string;
  /** Short hint for agents — mirrored in /llms.txt routing table */
  agentHint?: string;
};

export type DocsNavGroup = {
  title: string;
  items: DocsNavItem[];
};

export const docsNavGroups: DocsNavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Overview", agentHint: "Product summary and doc map" },
      { href: "/docs/installation", label: "Installation", agentHint: "pip/npm install, API key, first event" },
      { href: "/docs/installation/env-vars", label: "Environment Variables", agentHint: "AUREX_API_KEY, AUREX_LEDGER_PATH" },
      { href: "/docs/reference/autohook", label: "Zero-Code Auto-Hook", agentHint: "aurex install-hook" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { href: "/docs/reference", label: "API Reference Hub", agentHint: "Links to focused API pages" },
      { href: "/docs/reference/integration", label: "Manual Integration", agentHint: "singleton init, flush, patch" },
      { href: "/docs/reference/config", label: "AurexConfig", agentHint: "core config fields" },
      { href: "/docs/reference/budget-guard", label: "BudgetGuard", agentHint: "spend circuit breaker limits" },
      { href: "/docs/reference/providers", label: "Supported Providers", agentHint: "OpenAI, Anthropic, LiteLLM, etc." },
      { href: "/docs/reference/guards", label: "Real-Time Guards", agentHint: "pre_call_check, LoopGuard, Compressor" },
    ],
  },
];

/** Flat list for sitemap / agent discovery */
export const docsAgentRoutes = docsNavGroups.flatMap((g) => g.items);
