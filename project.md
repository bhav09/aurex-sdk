# Enhanced Task Brief (ETB)

## Original Request
"Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself. To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos."

## Analysis & Enhanced Prompt
The user wants to implement the "Lumina Token Waste Auditor: Expansion Plan" which includes:
1. D3.js Interactive Visualizations (Timeline and Donut charts)
2. Direct Platform Integrations (OAuth/API keys for LangSmith, Helicone)
3. WebAssembly Local Semantic Clustering (using `@xenova/transformers`)
4. Proactive CI/CD and Alerting (Node CLI wrapper for audit)
5. A/B Testing Simulator / Replay (Direct API calls to cheaper models for comparison)

The plan involves significant changes spanning frontend UI, worker threads (adding an embedding worker), backend integrations, and a new CLI.

**Enhanced Task:** 
1. **D3 Charts:** Install `d3` & `@types/d3`. Create `src/charts.ts`. Modify `src/main.ts` to render a timeline chart from `AuditTracker.buckets` and a donut chart of model spend. Add interactivity to filter prompts by burst windows.
2. **Platform Integrations:** Create `src/integrations/`. Add API key inputs to UI. Implement adapters for LangSmith/Helicone to fetch logs, map to `UsageRow`, and run the audit.
3. **Semantic Clustering:** Install `@xenova/transformers`. Create `src/embedding-worker.ts` using `all-MiniLM-L6-v2`. Send unique prompts to the worker, group by cosine similarity, and expose `SemanticClusters` in `AuditResult`.
4. **CLI / CI/CD:** Extract core audit logic to be Node.js compatible. Create `cli/index.js` to parse CSVs via Node and run the audit. Provide a GitHub Action template `.github/workflows/lumina-audit.yml`.
5. **A/B Replay:** Add UI for "A/B Replay". Accept API keys. Fetch cheaper model responses for heavy prompts. Display a side-by-side diff.

## Mode
`[Production]`

## Scope of Changes
- **New files:** `src/charts.ts`, `src/integrations/*`, `src/embedding-worker.ts`, `cli/index.js`, `.github/workflows/lumina-audit.yml`.
- **Modifying:** `src/main.ts`, `src/worker.ts`, `src/audit.ts`, `package.json` (adding dependencies).

## Trade-offs
- **Speed vs Features:** Adding WASM embedding models and D3 will significantly increase the bundle size and initial load time, though computation happens locally.
- **Simplicity vs Automation:** Building a CLI requires maintaining both browser and Node compatibilities, complicating the build process (e.g., PapaParse works differently in Node vs Browser).
- **Security vs Integration:** Fetching logs directly requires users to input API keys. We will store these securely in `sessionStorage` and never persist them to a backend.
