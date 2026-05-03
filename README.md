# Lumina / Aurex

**Your AI usage, cost signals, and savings paths — in one repo.**

Canonical remote: **[github.com/bhav09/lumina-token](https://github.com/bhav09/lumina-token)**

| Stack | Path | Default URL | Role |
|--------|------|-------------|------|
| **Aurex** | `frontend/` + `backend/` | [http://localhost:3000](http://localhost:3000) | Next.js UI + FastAPI analysis |
| **Lumina** | repo root (`src/`, `cli/`, …) | [http://localhost:5173](http://localhost:5173) | Local-first Vite SPA + CLI |

---

## Clone & authenticate

```bash
git clone https://github.com/bhav09/lumina-token.git
cd lumina-token
```

If the repo is **private**, sign in with GitHub (**SSH**, **HTTPS + PAT**, or `gh auth login`). Unauthenticated `git clone` / `git fetch` can return “repository not found.” Collaborators need an accepted invite on the owning account.

---

## Quick start — Aurex (Next.js + FastAPI)

```bash
# Terminal 1 — backend
cd backend
pip install -r requirements.txt
python main.py

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** and upload your usage data.

### Aurex architecture

```
frontend/          Next.js 14 + TypeScript + Tailwind
backend/           FastAPI + SQLAlchemy + Pandas
├── ingestion/     CSV/JSON parsers
├── detection/     Cost detection algorithms
└── api/           REST endpoints
```

**Detections include:** agent loops, context explosion, redundant prompts, model misuse (e.g. premium model for tiny tasks), cost-driver concentration.

---

## Quick start — Lumina (Vite SPA, repo root)

```bash
npm install
npm run dev
```

Open the URL Vite prints (default **http://localhost:5173**). **Live demo** on home; **Upload** at **`#/upload`**.

All parsing and analysis run **in the browser** as deterministic TypeScript — **not** an LLM over your log rows. Optional network: public **LiteLLM** pricing JSON (and an optional **lead webhook**: email + score only).

### Lumina features

- **D3.js** — timeline and model-spend visualizations.
- **Integrations** — LangSmith / Helicone via API keys (browser-only; optional).
- **Semantic clustering (WASM)** — local embeddings via `@xenova/transformers`.
- **CLI** — `npx tsx cli/index.ts path/to/usage.csv` for markdown summary / CI.
- **A/B replay** — optional OpenAI call to compare a cheaper model on a flagged prompt.

### Why not only ChatGPT / a Claude skill?

1. **Privacy** — sensitive logs stay local in the tab (or in your CI runner for the CLI).
2. **Scale** — full-file CSV/stream processing without chat context limits.
3. **Math** — deterministic aggregates and cost math, not LLM guessing.
4. **Automation** — GitHub Actions + CLI vs. manual upload to chat every time.

### Model pricing (Lumina)

Loads **[LiteLLM `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)** when available. Fallback order: `public/model-catalog.json` (after `npm run sync-model-catalog`) → remote fetch → embedded table in `src/pricing.ts`.

### Build & deploy (Lumina)

```bash
npm run build
npm run preview   # local production preview
```

Ship the `dist/` folder to any static host.

### Lead webhook (Lumina, optional)

```bash
VITE_LEAD_WEBHOOK_URL=https://your.endpoint.example/lead npm run build
```

Unlock flow may POST `{ email, tokenCreditScore, source, at }` — **not** the usage file.

### Tests (Lumina)

```bash
npx vitest run
```

### Export format (Lumina)

CSV or JSON array of rows. Headers are normalized (e.g. `timestamp`, `model`, `prompt`, `input_tokens`, `output_tokens`, `request_id`). If only `total_tokens` exists, input/output are estimated heuristically.

### Limitations (Lumina)

- Redundancy: exact match by default; semantic groups are similarity-based heuristics.
- Model downgrade hints are heuristics — validate quality before changing routing.
- USD uses community list prices — not your enterprise rates.

More product detail: [`project.md`](project.md).

---

## Push your changes

With `origin` set to this repo and branch tracking `main`:

```bash
git push origin main
```

Use a feature branch + PR if `main` is protected.
