"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy anchor → sub-route map for old /docs/*#anchor links */
const HASH_REDIRECTS: Record<string, string> = {
  overview: "/docs",
  quickstart: "/docs/installation",
  autohook: "/docs/reference/autohook",
  integration: "/docs/reference/integration",
  "config-reference": "/docs/reference/config",
  "budget-guard-config": "/docs/reference/budget-guard",
  "provider-matrix": "/docs/reference/providers",
  guards: "/docs/reference/guards",
  "context-wrappers": "/docs/reference/wrap",
  outcomes: "/docs/reference/outcomes",
  "health-monitoring": "/docs/reference/health",
  heuristics: "/docs/reference/heuristics",
  cicd: "/docs/reference/ci",
  "serverless-flush": "/docs/deployment/serverless-flush",
  "readonly-fs": "/docs/deployment/filesystem",
  "network-resilience": "/docs/deployment/cloud-sync",
  "rate-limits": "/docs/deployment/rate-limits",
  "decision-matrix": "/docs/harness/decision-matrix",
  "env-vars": "/docs/installation/env-vars",
  install: "/docs/installation",
  "manual-init": "/docs/installation",
};

export function DocHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const target = HASH_REDIRECTS[hash];
    if (target) {
      router.replace(target);
    }
  }, [router]);

  return null;
}
