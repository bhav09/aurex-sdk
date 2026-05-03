# Lumina Token Waste Auditor (local-first web)

Static SPA: **all parsing and analysis run in the browser** as **deterministic TypeScript** (duplicates, time buckets, heuristics) — **not** an LLM call on your logs. Logs are not uploaded for analysis; the only optional network use is a **public model-pricing JSON** (and an optional lead webhook that sends email + score only).

## Key Features
* **Interactive Visualizations (D3.js)**: Drill-down timeline charts and spend concentration donuts.
* **Direct Platform Integrations**: Pull logs directly via local API keys (LangSmith, Helicone) without exporting CSVs.
* **Semantic Clustering (WASM)**: Groups prompts by meaning using local cosine similarity (all-MiniLM-L6-v2) directly in your browser.
* **Proactive CI/CD (Node CLI)**: `npx tsx cli/index.ts` integrates with GitHub Actions to alert on prompt cost spikes.
* **A/B Testing Simulator**: Replay expensive flagged requests against cheaper models (like gpt-4o-mini) and see a side-by-side local diff.

## Why not just use Claude, ChatGPT, or a Cursor Skill?

If you have a CSV of API logs, you might wonder why you can't just upload it directly to an LLM or use a custom "Token Analyzer" skill. Here's why Lumina is fundamentally better suited for this task:

1. **Absolute Privacy (Zero Data Egress)**: Production logs contain sensitive PII, proprietary system prompts, and secret data. Enterprise teams cannot legally upload these logs to a third-party LLM chat interface. Lumina is a **local-first Static SPA**. All processing, including semantic clustering, runs 100% locally in your browser or CI/CD pipeline.
2. **Context Limits & Scale**: LLMs have strict context window limits (e.g., 200k tokens) and will aggressively truncate large files. Lumina uses deterministic TypeScript to parse megabytes or gigabytes of log data instantly without losing a single row.
3. **Accurate Deterministic Math**: LLMs are notoriously bad at doing exact math across large datasets. If you ask an LLM to calculate the cost of 50,000 rows across 12 different model pricing tiers, it will hallucinate. Lumina provides 100% accurate, deterministic financial math.
4. **Proactive Automation**: A chatbot is reactive—you have to remember to ask it. Lumina provides a Node CLI that plugs directly into GitHub Actions, automatically warning developers on Pull Requests if their prompt changes will spike the monthly bill.
5. **No Token Waste to Measure Token Waste**: Having Claude analyze a massive CSV costs a significant amount of input tokens. Lumina does it for free on your own local CPU.

## GitHub (clone & collaborators)

- **Repository:** [github.com/bhav09/lumina-token](https://github.com/bhav09/lumina-token)
- **Private access:** If the repo is private, use an account that has **accepted a collaborator invite**. Authenticate Git with **SSH** (`git@github.com:bhav09/lumina-token.git`) or **HTTPS** with a [personal access token](https://docs.github.com/en/authentication) or GitHub CLI (`gh auth login`). Unauthenticated `git fetch` will show “repository not found” even for collaborators who are not logged in.
- **Layout note:** Upstream `main` may include a monorepo layout (`frontend/`, `backend/`). This branch or checkout might use a **Vite SPA at the repo root** instead. Before merging or resetting to `origin/main`, confirm with the team which layout should win.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). Home shows the **live demo** only; **Upload** is at **`#/upload`** (top nav). Export help (**“Where do I get an export?”**) appears at the top of the **Upload** page — from the home journey, use **Where?** to jump to `#/upload#find-export`.

## Model pricing (kept fresh)

On each load, the app fetches the **[LiteLLM community `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)** (CORS-enabled on GitHub). It aggregates many **OpenAI**, **Vertex / Google**, **Anthropic**, and other provider ids with per-token list prices for cost estimates. That file is **maintained upstream**, not by this repo — it is **not** an official vendor API.

**Fallback order**

1. `public/model-catalog.json` if present (e.g. after `npm run sync-model-catalog` for offline builds).
2. Live fetch from GitHub.
3. Small embedded table in `src/pricing.ts` if both fail.

You can load `examples/sample-usage.csv` (same rows as `src/demo/sample-usage.csv`) on the upload page.

## Build

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host.

## Lead capture (optional)

Set an environment variable when building:

```bash
VITE_LEAD_WEBHOOK_URL=https://your.endpoint.example/lead npm run build
```

On “Unlock full report,” the app POSTs JSON: `{ email, tokenCreditScore, source, at }` — **not** the usage file. If unset, unlock still works locally.

## Supported export shapes

CSV or JSON array of objects. Headers are matched case-insensitively, including aliases:

| Canonical   | Example aliases                                      |
|------------|-------------------------------------------------------|
| `timestamp`| `created_at`, `date`, `request_timestamp`, …          |
| `model`    | `model_name`, `deployment`                           |
| `prompt`   | `input`, `messages`, `query`, …                      |
| `input_tokens`  | `prompt_tokens`, `input_token_count`            |
| `output_tokens` | `completion_tokens`, `candidates_token_count`   |
| `request_id`    | `id`, `trace`                                   |

If only `total_tokens` exists, the app splits it roughly between input/output.

## Limitations

- “Semantic redundancy” is **exact normalized prompt** match unless you extend the code.
- Model downgrade suggestions are **heuristic**; validate quality before routing production traffic.
- USD estimates prefer the **LiteLLM pricing map** (community-sourced), then an embedded fallback — not your negotiated rates; confirm before finance use.

See `project.md` for the full product brief (preview → email gate → full score & roadmap).
