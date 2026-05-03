# Lumina / Aurex

Repository: [github.com/bhav09/lumina-token](https://github.com/bhav09/lumina-token)

This repo contains:

1. **Aurex (monorepo)** — Next.js + FastAPI stack under `frontend/` and `backend/`.
2. **Lumina Token Waste Auditor (root)** — local-first Vite SPA at the repo root (`src/`, `cli/`, etc.).

---

## Quick start — Aurex (Next.js + FastAPI)

```bash
# Backend
cd backend
pip install -r requirements.txt
python main.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` and upload your usage data.

### Aurex architecture

```
frontend/          Next.js 14 + TypeScript + Tailwind
backend/           FastAPI + SQLAlchemy + Pandas
├── ingestion/     CSV/JSON parsers
├── detection/     5 cost detection algorithms
└── api/           REST endpoints
```

**What Aurex detects:** agent loops, context explosion, redundant prompts, model misuse (e.g. GPT-4 for tiny tasks), cost-driver concentration.

---

## Quick start — Lumina (Vite SPA, repo root)

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). Home shows the **live demo**; **Upload** is at **`#/upload`**.

Static SPA: **parsing and analysis run in the browser** as deterministic TypeScript — not an LLM on your logs. Optional network: public model-pricing JSON (and optional lead webhook for email + score only).

### Key features (Lumina)

- **Interactive visualizations (D3.js):** timeline and model-spend charts.
- **Integrations:** LangSmith / Helicone via API keys in the browser (optional).
- **Semantic clustering (WASM):** local embeddings (`@xenova/transformers`).
- **CLI:** `npx tsx cli/index.ts <usage.csv>` for CI (see `.github/workflows/`).
- **A/B replay:** try cheaper models against flagged prompts (optional OpenAI key).

### Why not only ChatGPT / a Claude skill?

1. **Privacy:** logs stay in the tab; no upload for analysis.
2. **Scale:** no LLM context limit on full CSV size.
3. **Math:** deterministic cost aggregation, not approximate.
4. **Automation:** CLI + Actions vs. manual chat sessions.

### Model pricing (Lumina)

On each load, the app may fetch **[LiteLLM `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)**. Fallback: `public/model-catalog.json` → GitHub → embedded table in `src/pricing.ts`.

### Build (Lumina)

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host.

### Lead capture (Lumina, optional)

```bash
VITE_LEAD_WEBHOOK_URL=https://your.endpoint.example/lead npm run build
```

On “Unlock full report,” the app can POST `{ email, tokenCreditScore, source, at }` — not the usage file.

### Supported export shapes (Lumina)

CSV or JSON array of objects. Headers matched case-insensitively (e.g. `timestamp`, `model`, `prompt`, `input_tokens`, `output_tokens`, `request_id`). If only `total_tokens` exists, input/output are split heuristically.

### Limitations (Lumina)

- Exact-match redundancy unless semantic clustering is used; clustering is heuristic.
- Downgrade suggestions are heuristic; validate quality before routing production traffic.
- USD estimates use community pricing — not your negotiated rates.

See `project.md` for the Lumina product brief.

---

## GitHub access

Use an account with access to [bhav09/lumina-token](https://github.com/bhav09/lumina-token). For private repos authenticate with **SSH** or **HTTPS + PAT** / `gh auth login`. Unauthenticated `git fetch` may show “repository not found”.
