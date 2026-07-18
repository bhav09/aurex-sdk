export type DocsNavItem = {
  href: string;
  label: string;
  /** Short hint for agents - mirrored in /llms.txt routing table */
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
      { href: "/docs/installation", label: "Installation", agentHint: "pip/npm install, API key, first request" },
      { href: "/docs/installation/env-vars", label: "Environment Variables", agentHint: "AUREX_API_KEY, AUREX_LEDGER_PATH" },
      { href: "/docs/reference/autohook", label: "Zero-Code Auto-Hook", agentHint: "aurex install-hook" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { href: "/docs/reference", label: "API Reference Hub", agentHint: "Links to focused API pages" },
      { href: "/docs/reference/integration", label: "Integration", agentHint: "singleton init, flush, patch lifecycle" },
      { href: "/docs/reference/config", label: "AurexConfig", agentHint: "core config fields" },
      { href: "/docs/reference/budget-guard", label: "BudgetGuard", agentHint: "spending and rate limits" },
      { href: "/docs/reference/providers", label: "Supported Providers", agentHint: "OpenAI, Anthropic, LiteLLM, etc." },
      { href: "/docs/reference/guards", label: "Runtime Guards", agentHint: "pre_call_check, route, compress, block" },
      { href: "/docs/reference/wrap", label: "wrap() Context", agentHint: "request-scoped budget and overrides" },
      { href: "/docs/reference/outcomes", label: "Outcomes", agentHint: "workflow success/failure signals" },
      { href: "/docs/reference/health", label: "Health & Status", agentHint: "runtime health, sync status, recovery" },
      { href: "/docs/reference/heuristics", label: "Heuristics CLI", agentHint: "ledger analysis and optimization" },
      { href: "/docs/reference/ci", label: "CI Policy Gate", agentHint: "enforce policies in CI pipelines" },
    ],
  },
  {
    title: "Integration Patterns",
    items: [
      { href: "/docs/harness", label: "Overview", agentHint: "auto-patch vs wrap vs manual" },
      { href: "/docs/harness/decision-matrix", label: "Decision Matrix", agentHint: "pick integration style for your stack" },
    ],
  },
  {
    title: "Deployment",
    items: [
      { href: "/docs/deployment", label: "Overview", agentHint: "environment matrix and patterns" },
      { href: "/docs/deployment/serverless-flush", label: "Serverless", agentHint: "flush() before Lambda/Edge exit" },
      { href: "/docs/deployment/filesystem", label: "Filesystem & Ledger", agentHint: "read-only FS, ledger path" },
      { href: "/docs/deployment/cloud-sync", label: "Cloud Sync", agentHint: "HTTP retries, queue, 429 handling" },
      { href: "/docs/deployment/rate-limits", label: "Rate Limits", agentHint: "per-key ingest limits" },
    ],
  },
  {
    title: "Reliability",
    items: [
      { href: "/docs/reliability", label: "Overview", agentHint: "automatic retry and failover" },
      { href: "/docs/reliability/policy", label: "ResiliencePolicy", agentHint: "resilience config" },
      { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce", agentHint: "detect-only vs active retry" },
      { href: "/docs/reliability/fallbacks", label: "Fallbacks", agentHint: "register_fallback with custom clients" },
      { href: "/docs/reliability/classification", label: "Classification", agentHint: "retry_on failure kinds" },
      { href: "/docs/reliability/accounting", label: "Cost Accounting", agentHint: "cost tracking and dashboard metrics" },
    ],
  },
];

/** Flat list for sitemap / agent discovery */
export const docsAgentRoutes = docsNavGroups.flatMap((g) => g.items);
