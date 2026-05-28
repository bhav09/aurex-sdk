/**
 * Zero-code auto-instrumentation entry point for Node.
 *
 * Activate via either:
 *   1. `node --require aurex-sdk/hook your_app.js`
 *   2. `NODE_OPTIONS="--require aurex-sdk/hook" node your_app.js`
 *
 * `aurex install-hook` writes the second form into a project-local
 * `.env.aurex` and prints instructions.
 *
 * Activation requires both AUREX_ENABLED=1 and AUREX_API_KEY=...
 * Failures are swallowed.
 */

import { AurexAuditor } from "./index";

(function activate() {
  if (process.env.AUREX_ENABLED !== "1") return;
  if (!process.env.AUREX_API_KEY) return;

  try {
    const auditor = AurexAuditor.getInstance({
      apiKey: process.env.AUREX_API_KEY,
      project: process.env.AUREX_PROJECT || "default",
      cloudSync: true,
      localOnly: false,
      baseUrl: process.env.AUREX_BASE_URL,
    });
    auditor.patchAll();
    if (process.env.AUREX_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.error("[aurex] auto-instrumentation active");
    }
  } catch (err) {
    if (process.env.AUREX_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.error("[aurex] hook init failed:", err);
    }
  }
})();
