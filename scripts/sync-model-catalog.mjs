/**
 * Download LiteLLM pricing map into public/ for offline or air-gapped builds.
 * Optional - by default the app fetches the same URL in the browser.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });
const out = join(pub, "model-catalog.json");

const res = await fetch(url);
if (!res.ok) {
  console.error("Fetch failed:", res.status);
  process.exit(1);
}
const text = await res.text();
writeFileSync(out, text, "utf8");
console.log("Wrote", out, `(${(text.length / 1e6).toFixed(2)} MB)`);
