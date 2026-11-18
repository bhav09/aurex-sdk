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
      { href: "/docs", label: "Overview", agentHint: "3-stage pipeline summary & 60s quickstart" },
      { href: "/docs/installation", label: "Quickstart & Install", agentHint: "pip/npm install, patch_all, auto-hook" },
    ],
  },
  {
    title: "3-Stage Protection Pipeline",
    items: [
      { href: "/docs/stage-1-shield", label: "Stage 1: Before the Call", agentHint: "Prefix Cache-Shield & 200k Cliff Guard" },
      { href: "/docs/stage-2-breaker", label: "Stage 2: During the Call", agentHint: "Session Spend, Thinking & Stream Breaker" },
      { href: "/docs/stage-3-outcomes", label: "Stage 3: After the Call + CI", agentHint: "Cost per Outcome, Soft Failures & PR Diff" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/reference", label: "Config & Providers", agentHint: "AurexConfig, BudgetGuard, env vars, providers" },
    ],
  },
];

/** Flat list for sitemap / agent discovery */
export const docsAgentRoutes = docsNavGroups.flatMap((g) => g.items);
