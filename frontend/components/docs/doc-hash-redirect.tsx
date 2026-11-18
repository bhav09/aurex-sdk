"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy anchor → consolidated route map */
const HASH_REDIRECTS: Record<string, string> = {
  overview: "/docs",
  quickstart: "/docs/installation",
  autohook: "/docs/installation",
  integration: "/docs/installation",
  install: "/docs/installation",
  "manual-init": "/docs/installation",
  "prompt-optimization": "/docs/stage-1-shield",
  "infinite-loop-detection": "/docs/stage-2-breaker",
  "cost-based-routing": "/docs/stage-2-breaker",
  guards: "/docs/stage-2-breaker",
  "budget-guard-config": "/docs/stage-2-breaker",
  "resilience-fallbacks": "/docs/stage-3-outcomes",
  outcomes: "/docs/stage-3-outcomes",
  cicd: "/docs/stage-3-outcomes",
  "config-reference": "/docs/reference",
  "provider-matrix": "/docs/reference",
  "env-vars": "/docs/reference",
};

export function DocHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const target = HASH_REDIRECTS[hash];
    if (target && target !== window.location.pathname) {
      router.replace(target);
    }
  }, [router]);

  return null;
}
