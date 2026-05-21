# Lumina / Aurex 

**Analyze LLM usage, surface waste, and estimate savings — two complementary stacks in one repository.**

| | |
|---|---|
| **Canonical GitHub** | [github.com/bhav09/lumina-token](https://github.com/bhav09/lumina-token) |
| **Maintainer** | [@bhav09](https://github.com/bhav09), [@aakriti1318](https://github.com/aakriti1318) (repository owner; collaborators push via their own accounts or shared CI) |

---

## Table of contents

1. [What’s in this repo](#whats-in-this-repo)  
2. [Repository layout](#repository-layout)  
3. [Prerequisites](#prerequisites)  
4. [Aurex — Next.js + FastAPI](#aurex--nextjs--fastapi)  
5. [Lumina — Vite SPA + CLI (repo root)](#lumina--vite-spa--cli-repo-root)  
6. [How the two stacks differ](#how-the-two-stacks-differ)  
7. [Security & data handling](#security--data-handling)  
8. [CI (Lumina CLI)](#ci-lumina-cli)  

---

## What’s in this repo

This monorepo hosts:

1. **Aurex** — A **Next.js** marketing/audit UI (`frontend/`) backed by a **FastAPI** service (`backend/`) that ingests usage CSV/JSON, runs detection heuristics, and exposes REST APIs (Token Credit Score, executive summary, recommendations).
2. **Lumina (Token Waste Auditor)** — A **local-first Vite + TypeScript** single-page app at the **repository root** plus a small **Node CLI**: parsing and most analysis run entirely in the browser (or in CI via the CLI) without sending your log rows to an LLM provider for “reasoning over the file.”

Use **Aurex** when you want a full-stack product experience with a persistent backend and API docs. Use **Lumina** when you want maximum privacy, static hosting, and deterministic in-browser math on large exports.

---

## Repository layout

```
lumina-token/
├── backend/                 # Aurex — FastAPI, SQLAlchemy, Pandas
│   ├── main.py              # App entry (uvicorn); default API port 8000
│   ├── requirements.txt
│   └── src/
│       ├── api/             # REST routes (/api/v1/...)
│       ├── detection/       # Cost / waste heuristics
│       ├── ingestion/       # CSV / JSON parsers
│       └── models/          # ORM models
├── frontend/                # Aurex — Next.js App Router, Tailwind, shadcn-style UI
│   ├── app/
│   ├── components/
│   └── lib/api-client.ts    # Uses NEXT_PUBLIC_API_URL → backend
├── cli/                     # Lumina — headless audit (Markdown summary)
├── src/                     # Lumina — Vite app (main.ts, audit.ts, workers, integrations)
├── test/                    # Lumina — Vitest
├── examples/                # Sample CSV for Lumina
├── .github/workflows/       # e.g. Lumina audit workflow template
├── project.md               # Lumina product / ETB notes
├── package.json             # Lumina (root) — Vite, Vitest, tsx
└── README.md                # This file
```

---

## Prerequisites

| Tool | Aurex | Lumina (root) |
|------|--------|----------------|
| **Node.js** | Yes (`frontend/`) | Yes (18+ recommended) |
| **Python** | **3.10+** (`backend/`) | Optional (only if you run `backend/`) |
| **npm** | Yes | Yes |

---

## Aurex — Next.js + FastAPI

### 1. Backend (FastAPI)

From `backend/`:

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # if you use env files; adjust DATABASE_URL etc.
python main.py
```

**Defaults (see `main.py`):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_HOST` | `0.0.0.0` | Bind address |
| `API_PORT` | `8000` | HTTP port |
| `DEBUG` | `True` | Uvicorn reload |
| `DATABASE_URL` | SQLite (see `backend/README.md`) | Optional PostgreSQL for production |

**Useful URLs:**

- API root: [http://localhost:8000](http://localhost:8000)  
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)  
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

**Example endpoints** (prefix `/api/v1`; see `backend/README.md` for the full list):

- `POST /api/v1/upload/csv` — upload usage data  
- `GET /api/v1/executive-summary` — aggregated analysis  
- `GET /api/v1/audit/history/{email}` — past audits (when enabled)

**Sample data:** e.g. `backend/supportbot_ai_usage.csv`, `backend/datapulse_usage.csv` — upload via the UI or API as documented in `backend/README.md`.

### 2. Frontend (Next.js)

From `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** (default Next dev server).

**Backend URL:** The client uses `lib/api-client.ts`:

```text
NEXT_PUBLIC_API_URL  →  default http://localhost:8000/api/v1
```

For a non-default API host/port, create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 3. Production-style commands (Aurex)

```bash
# Frontend
cd frontend && npm run build && npm run start

# Backend — use a production ASGI server / container; see backend docs
```

**Stack summary:** Next.js (React, Tailwind, Radix-based components), FastAPI, SQLAlchemy, Pandas; ingestion and detection packages under `backend/src/`.

---

## Lumina — Vite SPA + CLI (repo root)

### Dev server

```bash
npm install
npm run dev
```

Default dev URL: **http://localhost:5173** (Vite). Routes: home + **`#/upload`** for file upload.

### What runs where

- **Main thread:** UI, routing (hash), report rendering, D3 charts, optional integration fetches.  
- **`src/worker.ts`:** Streams/parses large CSV in chunks; runs `AuditTracker`; optional semantic clustering step.  
- **`src/embedding-worker.ts`:** Local embedding model (WASM) for similarity clustering — **does not** send prompts to OpenAI/Anthropic for that step.

### Scripts (root `package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Local development |
| `build` | `tsc --noEmit && vite build` | Production bundle → `dist/` |
| `preview` | `vite preview` | Preview production build locally |
| `sync-model-catalog` | `node scripts/sync-model-catalog.mjs` | Refresh `public/model-catalog.json` for offline/air-gapped pricing |

### CLI (CI / local)

```bash
npx tsx cli/index.ts path/to/usage.csv
```

Emits a **Markdown** audit summary to stdout (useful in GitHub Actions).

### Environment variables (Lumina build-time)

| Variable | Purpose |
|----------|---------|
| `VITE_LEAD_WEBHOOK_URL` | Optional: on “unlock”, POST JSON with `email`, `tokenCreditScore`, `source`, `at` — **not** the usage file |

### Tests

```bash
npx vitest run
```

### Deploying Lumina

Build static assets:

```bash
npm run build
```

Deploy the **`dist/`** directory to any static host (S3, Cloudflare Pages, Netlify, GitHub Pages, etc.).

---

## Features (High Level)

- **Temporal clustering & statistical heuristics** (Aurex backend) to infer sessions and detect waste on generic provider CSVs that lack `Automation ID` or `system_prompt` labels.
- **Founder-focused insights** (Aurex UI) with clear executive summaries, projected annual savings, exact mathematical waste models, and engineering effort/confidence scores.
- **Exact + semantic redundancy** (semantic via local embeddings).  
- **Time-bucket “runaway”** spend signals, model-mismatch heuristics, and Token Credit Score-style readouts.  
- **D3** timeline and donut charts.  
- **LangSmith / Helicone** optional pull via user-supplied keys in the browser.  
- **A/B replay** (optional user OpenAI key): replay a flagged prompt against a cheaper model and compare output in the UI.

### Pricing data (Lumina)

Loads community **[LiteLLM `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)** when allowed by network/CORS. Fallback: bundled `public/model-catalog.json` (after sync script) → fetch → embedded table in `src/pricing.ts`. **Not** your negotiated enterprise rates — validate before finance use.

### Export shape (Lumina)

CSV or JSON arrays; headers normalized (`timestamp`, `model`, `prompt`, token columns, `request_id`, etc.). See table in earlier sections of app docs / `project.md`.

---

## How the two stacks differ

| Topic | Aurex | Lumina |
|--------|--------|--------|
| **Runtime** | Browser + Python API + DB | Browser-only for analysis (plus optional static fetches) |
| **Primary UX** | Next.js app at `:3000` | Vite SPA at `:5173` (Vite default) |
| **Best for** | Productized API, history, executive summary | Privacy-first, static deploy, huge single-file audits |
| **LLM on your logs?** | No — heuristics / engine in backend code | No — deterministic TS + optional **your** API key only for A/B replay |

---

## Security & data handling

- **Aurex:** Usage files go to **your** FastAPI instance and configured database; lock down CORS and `DATABASE_URL` in production.  
- **Lumina:** By design, **usage rows are not sent** to Anthropic/OpenAI for the core audit. Optional: LiteLLM catalog fetch, lead webhook, integration APIs (user-initiated keys), A/B replay (user-initiated OpenAI key).  
- Never commit real **API keys**, `.env` with secrets, or production CSVs containing PII. Use `.env.example` patterns only.

---

## CI (Lumina CLI)

See **`.github/workflows/lumina-audit.yml`** for an example of running the CLI against a checked-in sample (adjust paths and triggers to match your governance).

---

## More documentation

- **Lumina product brief / ETB:** [`project.md`](project.md)  
- **Aurex backend API & DB:** [`backend/README.md`](backend/README.md)  
- **Frontend (Aurex) notes:** [`frontend/README.md`](frontend/README.md)
- **Privacy Policy:** See [`frontend/app/privacy/page.tsx`](frontend/app/privacy/page.tsx) or `/privacy` in the Aurex app.
- **Terms & Conditions:** See [`frontend/app/terms/page.tsx`](frontend/app/terms/page.tsx) or `/terms` in the Aurex app.

---

**License / governance:** Refer to repository settings and any `LICENSE` file added by the owner; this README is documentation only.
