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
      { href: "/docs", label: "Overview", agentHint: "Start here for product summary" },
      { href: "/docs/installation", label: "Installation & Quick Start", agentHint: "pip/npm install, API key, first event" },
      { href: "/docs/installation#env-vars", label: "Environment Variables", agentHint: "AUREX_API_KEY, AUREX_LEDGER_PATH" },
      { href: "/docs/reference#autohook", label: "Zero-Code Auto-Hook", agentHint: "aurex install-hook" },
    ],
  },
  {
    title: "Cloud & Harness",
    items: [
      { href: "/docs/deployment", label: "Cloud Deployment", agentHint: "Lambda, K8s, read-only FS" },
      { href: "/docs/deployment#serverless-flush", label: "Serverless Flush", agentHint: "flushAndWait before handler return" },
      { href: "/docs/harness", label: "Harness Integration", agentHint: "patch vs wrap vs manual log" },
      { href: "/docs/harness#decision-matrix", label: "Harness Decision Matrix", agentHint: "avoid double-counting" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { href: "/docs/reference#integration", label: "Manual Integration", agentHint: "singleton init, flush, shutdown" },
      { href: "/docs/reference#config-reference", label: "AurexConfig Options", agentHint: "all config fields" },
      { href: "/docs/reference#budget-guard-config", label: "BudgetGuard Setup", agentHint: "circuit breaker limits" },
      { href: "/docs/reference#provider-matrix", label: "Supported Providers", agentHint: "OpenAI, Anthropic, LiteLLM, etc." },
    ],
  },
  {
    title: "Advanced",
    items: [
      { href: "/docs/reference#guards", label: "Real-Time Guards", agentHint: "pre_call_check" },
      { href: "/docs/reference#context-wrappers", label: "Context & Wrappers", agentHint: "wrap() per-request options" },
      { href: "/docs/reference#health-monitoring", label: "Health & Recovery", agentHint: "get_health, pending.jsonl" },
      { href: "/docs/reference#heuristics", label: "Offline Heuristics CLI", agentHint: "aurex audit" },
      { href: "/docs/reference#cicd", label: "CI Policy Gate", agentHint: "npx aurex ci" },
    ],
  },
];

/** Flat list for sitemap / agent discovery */
export const docsAgentRoutes = docsNavGroups.flatMap((g) => g.items);
