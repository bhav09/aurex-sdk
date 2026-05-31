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
    title: "Cloud & Harness",
    items: [
      { href: "/docs/deployment", label: "Cloud Deployment", agentHint: "Deployment hub" },
      { href: "/docs/deployment/serverless-flush", label: "Serverless Flush", agentHint: "flushAndWait before handler return" },
      { href: "/docs/deployment/filesystem", label: "Filesystem & Ledger", agentHint: "read-only FS, per_process_ledger" },
      { href: "/docs/deployment/cloud-sync", label: "Cloud Sync Resilience", agentHint: "HTTP retries, 429, queue drops" },
      { href: "/docs/deployment/rate-limits", label: "Backend Rate Limits", agentHint: "ingest limits per API key" },
      { href: "/docs/harness", label: "Harness Integration", agentHint: "patch vs wrap vs manual log" },
      { href: "/docs/harness/decision-matrix", label: "Harness Decision Matrix", agentHint: "avoid double-counting" },
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
      { href: "/docs/reference/guards", label: "Real-Time Guards", agentHint: "pre_call_check" },
      { href: "/docs/reference/wrap", label: "wrap() Context", agentHint: "per-request budget overrides" },
      { href: "/docs/reference/outcomes", label: "Outcomes", agentHint: "mark_success / mark_failure" },
      { href: "/docs/reference/health", label: "Health & Recovery", agentHint: "get_health, pending.jsonl" },
      { href: "/docs/reference/heuristics", label: "Heuristics CLI", agentHint: "aurex audit" },
      { href: "/docs/reference/ci", label: "CI Policy Gate", agentHint: "npx aurex ci" },
    ],
  },
  {
    title: "Reliability & Loss Recovery",
    items: [
      { href: "/docs/reliability", label: "Reliability Hub", agentHint: "Provider-call resilience overview" },
      { href: "/docs/reliability/overview", label: "Overview", agentHint: "billed-but-failed spend problem" },
      { href: "/docs/reliability/policy", label: "ResiliencePolicy", agentHint: "resilience config fields" },
      { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce", agentHint: "detect-only vs active retry" },
      { href: "/docs/reliability/fallbacks", label: "Fallbacks", agentHint: "register_fallback callables" },
      { href: "/docs/reliability/classification", label: "Classification", agentHint: "retry_on failure kinds" },
      { href: "/docs/reliability/accounting", label: "Loss Accounting", agentHint: "loss_avoided, dashboard metrics" },
    ],
  },
];

/** Flat list for sitemap / agent discovery */
export const docsAgentRoutes = docsNavGroups.flatMap((g) => g.items);
