import Papa, { type ParseError } from "papaparse";
import {
  recordsToUsageRows,
  runAudit,
  creditScore,
  optimizationRoadmap,
  type AuditResult,
} from "./audit";
import AuditWorker from "./worker?worker";
import { getPricingLabel } from "./pricing";
import { whereToGetLogsHtml } from "./help-content";
import { initModelCatalog } from "./catalog";
import { renderTimelineChart, renderDonutChart } from "./charts";
import { fetchLangSmithLogs, fetchHeliconeLogs } from "./integrations";
import { fetchCheaperModel } from "./ab-replay";
import sampleCsvRaw from "./demo/sample-usage.csv?raw";
import "./styles.css";

const STORAGE_KEY = "lumina_lead_unlock";

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function fmtUSD(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function getRoute(): "home" | "upload" {
  const h = window.location.hash.slice(1);
  const path = (h.split("#")[0] || "").replace(/^\//, "");
  if (path === "upload" || path.startsWith("upload/")) return "upload";
  return "home";
}

function loadUnlock(): { email: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const decoded = atob(raw);
    const o = JSON.parse(decoded) as { email?: string };
    if (o.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return { email: o.email };
  } catch {
    /* ignore */
  }
  return null;
}

function saveUnlock(email: string): void {
  const payload = btoa(JSON.stringify({ email, at: Date.now() }));
  sessionStorage.setItem(STORAGE_KEY, payload);
}

type Parsed = {
  audit: AuditResult;
  fileLabel: string;
  revenue?: number;
};

let state: Parsed | null = null;

function parseJsonFile(text: string): Record<string, unknown>[] {
  const data = JSON.parse(text) as unknown;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    if (Array.isArray(o.rows)) return o.rows as Record<string, unknown>[];
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
  }
  throw new Error("JSON must be an array of objects or { data: [...] }.");
}

function parseRecordsFromText(text: string, logicalName: string): Record<string, unknown>[] {
  const ext = logicalName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return parseJsonFile(text);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length) {
    const fatal = parsed.errors.find(
      (e: ParseError) => e.type === "Quotes" || e.type === "FieldMismatch"
    );
    if (fatal) throw new Error(`CSV parse: ${fatal.message}`);
  }
  return parsed.data.filter((r: Record<string, unknown>) => Object.keys(r).length > 0);
}

function buildAudit(records: Record<string, unknown>[], revenue?: number): AuditResult {
  const { rows, warnings } = recordsToUsageRows(records);
  const audit = runAudit(rows, revenue);
  audit.warnings.push(...warnings);
  return audit;
}

function handleFile(
  file: File,
  revenueStr: string,
  onProgress: (progress: string | number) => void
): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const revenue = revenueStr.trim() === "" ? undefined : Number(revenueStr.replace(/[^0-9.-]/g, ""));
    const rev = revenue != null && Number.isFinite(revenue) && revenue > 0 ? revenue : undefined;
    
    const worker = new AuditWorker();
    
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress(msg.rowsProcessed);
      } else if (msg.type === "success") {
        worker.terminate();
        resolve({ audit: msg.audit, fileLabel: file.name, revenue: rev });
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`Worker error: ${err.message}`));
    };
    
    worker.postMessage({ file, revenueUSD: rev });
  });
}

function sampleInputTableHtml(
  records: Record<string, unknown>[],
  maxRows: number
): string {
  if (!records.length) return "<p class=\"muted-note\">No rows.</p>";
  const cols = Object.keys(records[0]);
  const head = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = records
    .slice(0, maxRows)
    .map(
      (row) =>
        `<tr>${cols.map((c) => `<td>${esc(String(row[c] ?? "")).slice(0, 200)}</td>`).join("")}</tr>`
    )
    .join("");
  return `<div class="table-wrap table-compact"><table><thead>${head}</thead><tbody>${body}</tbody></table></div><p class="muted-note">${fmtNum(records.length)} rows total · showing ${Math.min(maxRows, records.length)}</p>`;
}

function rawCsvSnippet(text: string, maxLines: number): string {
  const lines = text.trimEnd().split("\n");
  const slice = lines.slice(0, maxLines).join("\n");
  const more = lines.length > maxLines ? `\n… +${lines.length - maxLines} lines` : "";
  return esc(slice + more);
}

function wireSampleDemo(
  demoInputMount: HTMLElement,
  demoOutMount: HTMLElement,
  demoPlaceholder: HTMLElement,
  inputDrawer: HTMLDetailsElement,
  runBtn: HTMLButtonElement
): void {
  const records = parseRecordsFromText(sampleCsvRaw, "sample-usage.csv");
  demoInputMount.innerHTML = `
    ${sampleInputTableHtml(records, 4)}
    <details class="raw-snippet-details">
      <summary>Raw CSV snippet</summary>
      <pre class="csv-snippet" tabindex="0">${rawCsvSnippet(sampleCsvRaw, 15)}</pre>
    </details>
  `;

  const hint = () => document.getElementById("demo-output-hint");

  runBtn.addEventListener("click", () => {
    void (async () => {
      runBtn.disabled = true;
      demoPlaceholder.setAttribute("hidden", "");
      demoOutMount.removeAttribute("hidden");
      hint()?.setAttribute("hidden", "");

      const audit = buildAudit(records, undefined);
      const parsed: Parsed = { audit, fileLabel: "sample-usage.csv", revenue: undefined };

      renderReport(demoOutMount, parsed, null, { mode: "demo" });
      inputDrawer.open = false;
      runBtn.textContent = "Run again";
      runBtn.disabled = false;
      demoOutMount.scrollIntoView({ behavior: "smooth", block: "start" });
    })();
  });
}

function previewMetricsHtml(audit: AuditResult, teaseSpend: boolean): string {
  const teaseClass = teaseSpend ? " preview-tease" : "";
  return `
    <div class="grid-metrics">
      <div class="metric honey-metric"><div class="lbl">Requests parsed</div><div class="val">${fmtNum(audit.rowCount)}</div></div>
      <div class="metric honey-metric"><div class="lbl">Est. spend (${esc(getPricingLabel())})</div><div class="val${teaseClass}">${fmtUSD(audit.estCostUSD)}</div></div>
      <div class="metric honey-metric"><div class="lbl">Repeat prompt groups</div><div class="val">${fmtNum(audit.duplicates.length)}</div></div>
      <div class="metric honey-metric"><div class="lbl">Burst windows</div><div class="val">${fmtNum(audit.runaways.length)}</div></div>
    </div>
  `;
}

function warningsPanel(audit: AuditResult): string {
  if (!audit.warnings.length) return "";
  return `
    <div class="parse-notes-panel honey-card" role="status">
      <p class="parse-notes-title">Parsing notes</p>
      <ul class="warnings-list">${audit.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    </div>
  `;
}

function dupTeaserHtml(audit: AuditResult, teaseTokens: boolean): string {
  const topDup = audit.duplicates[0];
  const tokClass = teaseTokens ? "preview-tease" : "";
  if (topDup != null) {
    return `<p class="dup-teaser">Heaviest repeat: <strong>${fmtNum(topDup.count)}×</strong> · duplicate input tokens (est.) <span class="${tokClass}">${fmtNum(topDup.wastedInputTokens)}</span>${teaseTokens ? " — unlock for full tables." : ""}</p>`;
  }
  return `<p class="dup-teaser muted-note">No strong exact-match repeats (or no prompt text in file).</p>`;
}

/** Accessible collapsible report block — long sections stay closed until opened. */
function reportCollapse(
  slug: string,
  title: string,
  subtitle: string | null,
  body: string,
  defaultOpen: boolean
): string {
  const sub = subtitle
    ? `<span class="collapse-sub">${esc(subtitle)}</span>`
    : "";
  return `
    <details class="collapse-panel" id="report-${slug}"${defaultOpen ? " open" : ""}>
      <summary class="collapse-panel-summary">
        <span class="collapse-chevron" aria-hidden="true"></span>
        <span class="collapse-heading">
          <span class="collapse-title">${esc(title)}</span>
          ${sub}
        </span>
      </summary>
      <div class="collapse-panel-body">${body}</div>
    </details>
  `;
}

function appChrome(route: "home" | "upload"): string {
  const uploadActive = route === "upload" ? " is-active" : "";
  const homeActive = route === "home" ? " is-active" : "";
  return `
    <div class="app-top">
      <a href="#/" class="brand"><span class="brand-mark">Lumina</span><span class="brand-muted"> Auditor</span></a>
      <nav class="app-nav" aria-label="Pages">
        <a class="nav-pill${homeActive}" href="#/">Live demo</a>
        <a class="nav-pill nav-pill--accent${uploadActive}" href="#/upload">Upload file</a>
      </nav>
    </div>
  `;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const unlocked = loadUnlock();
  const route = getRoute();

  if (route === "home") {
    app.innerHTML = `
    <div class="shell">
      ${appChrome("home")}
      <div class="trust-strip trust-strip--stack" role="note">
        <div class="trust-strip-row">
          <span class="trust-icon" aria-hidden="true"></span>
          <span><strong>Zero-cloud</strong> — your file never leaves this tab.</span>
        </div>
        <p class="trust-strip-sub"><strong>No LLM on your logs.</strong> Waste scores come from deterministic TypeScript (duplicates, time buckets, heuristics). The only optional network call is a public pricing catalog — never your rows.</p>
      </div>

      <header class="hero">
        <h1>Token waste audit</h1>
        <p class="sub">Spot duplicate prompts, burst spend, and model mix — with a credit-style readout when you’re ready.</p>
        <div class="hero-actions">
          <a class="btn" href="#demo">Jump to sample</a>
          <a class="btn btn-honey" href="#/upload">Upload my file →</a>
        </div>
      </header>

      <p class="eyebrow journey-eyebrow">How it works</p>
      <nav class="journey" aria-label="Steps">
        <ol class="journey-list">
          <li>
            <span class="journey-step">1</span>
            <div class="journey-copy">
              <strong>Get data</strong>
              <span>CSV/JSON of calls · <a href="#/upload#find-export">Where?</a></span>
            </div>
          </li>
          <li>
            <span class="journey-step">2</span>
            <div class="journey-copy">
              <strong>Try the sample</strong>
              <span>Run the audit below</span>
            </div>
          </li>
          <li>
            <span class="journey-step">3</span>
            <div class="journey-copy">
              <strong>Your export</strong>
              <span><a href="#/upload">Upload page →</a></span>
            </div>
          </li>
        </ol>
      </nav>

      <section class="section demo-block" id="demo">
        <p class="eyebrow">Live demo · no email</p>
        <h2 class="section-title">Sample audit</h2>
        <p class="section-lead">Review the sample rows, then run the audit. Output stays hidden until you click; after it runs, the input tucks away so you can focus on results.</p>

        <div class="demo-split demo-stack">
          <details class="collapse-panel demo-input-drawer" id="demo-input-drawer" open>
            <summary class="collapse-panel-summary">
              <span class="collapse-chevron" aria-hidden="true"></span>
              <span class="collapse-heading">
                <span class="collapse-title">Input · bundled CSV</span>
                <span class="collapse-sub">Time, model, prompt, tokens</span>
              </span>
            </summary>
            <div class="collapse-panel-body">
              <p class="microcopy flush-micro">Same shape many teams export from their API gateway.</p>
              <div id="demo-input-inner"></div>
              <button type="button" class="btn btn-honey demo-run-btn" id="demo-run-btn">
                Run sample audit
              </button>
            </div>
          </details>

          <div class="demo-col panel panel-accent demo-output-shell">
            <h3 class="h3">Output</h3>
            <p id="demo-output-hint" class="microcopy">Hidden until you run — then each section stays collapsed; open what you need.</p>
            <div id="demo-output-placeholder" class="demo-output-placeholder">
              <p class="placeholder-copy">Run the audit to compute results locally in your browser.</p>
            </div>
            <div id="demo-output-mount" class="demo-output-mount" hidden></div>
          </div>
        </div>
      </section>
    </div>
  `;
    const demoInputInner = app.querySelector<HTMLDivElement>("#demo-input-inner")!;
    const demoOutMount = app.querySelector<HTMLDivElement>("#demo-output-mount")!;
    const demoPh = app.querySelector<HTMLDivElement>("#demo-output-placeholder")!;
    const drawer = app.querySelector<HTMLDetailsElement>("#demo-input-drawer")!;
    const runBtn = app.querySelector<HTMLButtonElement>("#demo-run-btn")!;
    wireSampleDemo(demoInputInner, demoOutMount, demoPh, drawer, runBtn);
    return;
  }

  /* —— Upload page —— */
  app.innerHTML = `
    <div class="shell shell--upload">
      ${appChrome("upload")}
      <div class="trust-strip trust-strip--stack" role="note">
        <div class="trust-strip-row">
          <span class="trust-icon" aria-hidden="true"></span>
          <span><strong>Zero-cloud</strong> — your export stays in this browser for the audit.</span>
        </div>
        <p class="trust-strip-sub"><strong>No LLM on your file.</strong> Same rule-based engine as the demo. Optional webhook posts email only — not your CSV. Optional pricing catalog fetch never includes your data.</p>
      </div>

      <header class="page-head">
        <a href="#/" class="back-link">← Back to overview &amp; demo</a>
        <h1 class="page-title">Upload your export</h1>
        <p class="page-dek">We show a quick preview after upload; long tables live in sections you open when you need them.</p>
      </header>

      <div class="upload-help-slot">${whereToGetLogsHtml()}</div>

      <div class="panel upload-panel honey-card">
        <label class="dropzone dropzone-premium" id="dz">
          <input type="file" id="file" accept=".csv,.json,text/csv,application/json" />
          <div class="dropzone-title"><strong>Drop file here</strong> or click to browse</div>
          <div class="muted-note dropzone-hint"><code>timestamp</code>, <code>model</code>, tokens · <a href="#find-export">Column help</a></div>
        </label>
        
        <details class="collapse-panel integrations-panel" style="margin-top: 1rem;">
          <summary class="collapse-panel-summary">
            <span class="collapse-chevron" aria-hidden="true"></span>
            <span class="collapse-heading">
              <span class="collapse-title">Or connect observability platform</span>
              <span class="collapse-sub">LangSmith, Helicone (Local API Key fetch)</span>
            </span>
          </summary>
          <div class="collapse-panel-body" style="display:flex; flex-direction:column; gap:1rem;">
            <div class="field">
              <label for="langsmith-key">LangSmith API Key</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="password" id="langsmith-key" placeholder="ls_..." style="flex:1;" />
                <input type="text" id="langsmith-project" placeholder="default" style="width:120px;" />
                <button type="button" class="btn" id="btn-langsmith">Fetch</button>
              </div>
            </div>
            <div class="field">
              <label for="helicone-key">Helicone API Key</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="password" id="helicone-key" placeholder="sk-..." style="flex:1;" />
                <button type="button" class="btn" id="btn-helicone">Fetch</button>
              </div>
            </div>
          </div>
        </details>

        <div class="row upload-revenue-row" style="margin-top: 1rem;">
          <div class="field">
            <label for="revenue">Optional revenue (USD) for Token ROI</label>
            <input type="text" id="revenue" inputmode="decimal" placeholder="e.g. 2400000" />
          </div>
        </div>
      </div>

      <div id="report-root" class="report-anchor"></div>
    </div>
  `;

  const dz = app.querySelector<HTMLLabelElement>("#dz")!;
  const fileInput = app.querySelector<HTMLInputElement>("#file")!;
  const revenueInput = app.querySelector<HTMLInputElement>("#revenue")!;
  const reportRoot = app.querySelector<HTMLDivElement>("#report-root")!;

  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("dropzone-active");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("dropzone-active"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dropzone-active");
    const f = e.dataTransfer?.files[0];
    if (f) void processFile(f);
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) void processFile(f);
  });

  const btnLangSmith = app.querySelector<HTMLButtonElement>("#btn-langsmith");
  const inputLangSmithKey = app.querySelector<HTMLInputElement>("#langsmith-key");
  const inputLangSmithProject = app.querySelector<HTMLInputElement>("#langsmith-project");

  if (btnLangSmith && inputLangSmithKey && inputLangSmithProject) {
    btnLangSmith.addEventListener("click", async () => {
      const key = inputLangSmithKey.value.trim();
      const proj = inputLangSmithProject.value.trim() || "default";
      if (!key) return alert("Please enter a LangSmith API key");
      
      btnLangSmith.disabled = true;
      btnLangSmith.textContent = "Fetching...";
      try {
        const file = await fetchLangSmithLogs(key, proj);
        void processFile(file);
      } catch (err: any) {
        alert("LangSmith fetch failed: " + err.message);
      } finally {
        btnLangSmith.disabled = false;
        btnLangSmith.textContent = "Fetch";
      }
    });
  }

  const btnHelicone = app.querySelector<HTMLButtonElement>("#btn-helicone");
  const inputHeliconeKey = app.querySelector<HTMLInputElement>("#helicone-key");

  if (btnHelicone && inputHeliconeKey) {
    btnHelicone.addEventListener("click", async () => {
      const key = inputHeliconeKey.value.trim();
      if (!key) return alert("Please enter a Helicone API key");
      
      btnHelicone.disabled = true;
      btnHelicone.textContent = "Fetching...";
      try {
        const file = await fetchHeliconeLogs(key);
        void processFile(file);
      } catch (err: any) {
        alert("Helicone fetch failed: " + err.message);
      } finally {
        btnHelicone.disabled = false;
        btnHelicone.textContent = "Fetch";
      }
    });
  }

  async function processFile(file: File): Promise<void> {
    reportRoot.innerHTML = `<div class="panel panel-loading honey-card">
      <div style="text-align:center; padding:2rem;">
        <p style="color:var(--text); font-weight:600; margin-bottom: 0.5rem;">Streaming File Locally</p>
        <p id="progress-text" style="color:var(--muted);">Starting...</p>
      </div>
    </div>`;
    
    const progressEl = reportRoot.querySelector<HTMLParagraphElement>("#progress-text");
    try {
      state = await handleFile(file, revenueInput.value, (rowsProcessed) => {
        if (progressEl) {
          progressEl.textContent = typeof rowsProcessed === "number" ? `Parsed ${fmtNum(rowsProcessed)} rows...` : String(rowsProcessed);
        }
      });
      renderReport(reportRoot, state, unlocked, { mode: "user" });
      reportRoot.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportRoot.innerHTML = `<div class="panel warnings honey-card">Could not parse file: ${esc(msg)}</div>`;
    }
  }

  if (state) renderReport(reportRoot, state, unlocked, { mode: "user" });

  requestAnimationFrame(() => {
    if (window.location.hash.includes("find-export")) {
      document.getElementById("find-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

type ReportMode = "user" | "demo";

function renderReport(
  root: HTMLElement,
  parsed: Parsed,
  unlocked: { email: string } | null,
  opts: { mode?: ReportMode } = {}
): void {
  const mode = opts.mode ?? "user";
  const isDemo = mode === "demo";
  const { audit } = parsed;
  const { score, breakdown } = creditScore(audit);
  const roadmap = optimizationRoadmap(audit);

  const warnHtml = warningsPanel(audit);

  if (isDemo) {
    const glanceBody = `
      <div class="badge-row"><span class="badge badge-live">Live calculation</span></div>
      ${previewMetricsHtml(audit, false)}
      ${dupTeaserHtml(audit, false)}
    `;
    root.innerHTML = `
      ${warnHtml}
      <p class="demo-complete-msg">Here’s a quick readout — open any section below for full tables.</p>
      <div class="demo-live-metrics honey-card">${glanceBody}</div>
      <div class="report-stack" id="full-report">${fullReportHtml(audit, score, breakdown, roadmap)}</div>
      <p class="handoff honey-handoff"><a href="#/upload" class="handoff-link">Open upload page</a> <span class="handoff-muted">· email gate applies only to your file</span></p>
    `;
    wireInteractiveBlocks(audit);
    return;
  }

  const previewMetrics = previewMetricsHtml(audit, true);
  const dupPreview = dupTeaserHtml(audit, true);

  const fullSection = unlocked != null ? fullReportHtml(audit, score, breakdown, roadmap) : "";

  const gateHtml =
    unlocked == null
      ? `
    <div class="gate honey-card" id="email-gate">
      <h3 class="gate-title">Unlock full report</h3>
      <p class="gate-lead">Work email shows you’re serious — we still process everything here in-browser.</p>
      <form class="gate-form" id="gate-form">
        <input type="email" name="email" required autocomplete="email" placeholder="you@company.com" aria-label="Work email" />
        <button type="submit" class="btn btn-honey">Unlock</button>
      </form>
      <p class="muted-note gate-foot">Optional: <code>VITE_LEAD_WEBHOOK_URL</code> — POSTs email + score, not your logs.</p>
    </div>
  `
      : `<div class="panel panel-inline honey-card"><p class="inline-msg">Unlocked for <strong>${esc(unlocked.email)}</strong> this session.</p></div>`;

  root.innerHTML = `
    ${warnHtml}
    <div class="panel honey-card preview-panel">
      <h3 class="preview-heading">Preview · ${esc(parsed.fileLabel)}</h3>
      <p class="preview-dek">Summary metrics — full tables are in the sections below after you unlock.</p>
      ${previewMetrics}
      ${dupPreview}
    </div>
    ${gateHtml}
    <div class="report-stack" id="full-report">${fullSection}</div>
  `;

  if (unlocked != null) wireInteractiveBlocks(audit);

  if (unlocked != null) return;

  const form = root.querySelector<HTMLFormElement>("#gate-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const url = import.meta.env.VITE_LEAD_WEBHOOK_URL;
    if (url) {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            tokenCreditScore: score,
            source: "lumina-token-auditor",
            at: new Date().toISOString(),
          }),
        });
      } catch {
        /* still unlock locally */
      }
    }
    saveUnlock(email);
    const full = root.querySelector<HTMLDivElement>("#full-report");
    if (full) {
      full.innerHTML = fullReportHtml(audit, score, breakdown, roadmap);
      wireInteractiveBlocks(audit);
    }
    const gate = form.closest("#email-gate");
    if (gate) {
      gate.outerHTML = `<div class="panel panel-inline honey-card"><p class="inline-msg">Unlocked for <strong>${esc(email)}</strong> this session.</p></div>`;
    }
  });
}

function wireInteractiveBlocks(audit: AuditResult) {
  setTimeout(() => {
    const timelineEl = document.getElementById("chart-timeline");
    if (timelineEl) renderTimelineChart(timelineEl, audit.timeSeriesData);
    
    const donutEl = document.getElementById("chart-donut");
    if (donutEl) renderDonutChart(donutEl, audit.modelSpendData);

    const btnReplay = document.getElementById("btn-ab-replay") as HTMLButtonElement | null;
    const inputApiKey = document.getElementById("ab-openai-key") as HTMLInputElement | null;
    const selectPrompt = document.getElementById("ab-prompt-select") as HTMLSelectElement | null;
    const replayOutput = document.getElementById("ab-replay-output");

    if (btnReplay && inputApiKey && selectPrompt && replayOutput) {
      btnReplay.addEventListener("click", async () => {
        const key = inputApiKey.value.trim();
        const promptIndex = selectPrompt.value;
        if (!key) return alert("Please enter an OpenAI API key for A/B testing.");
        if (!promptIndex) return alert("Please select a prompt.");

        const mismatch = audit.modelMismatches[parseInt(promptIndex, 10)];
        if (!mismatch) return alert("Invalid mismatch selected.");

        btnReplay.disabled = true;
        btnReplay.textContent = "Running...";
        replayOutput.innerHTML = `<p class="muted-note">Simulating request to gpt-4o-mini...</p>`;
        
        try {
          const res = await fetchCheaperModel(mismatch.samplePrompt, key, "gpt-4o-mini");
          replayOutput.innerHTML = `
            <div style="display:flex; gap:1rem; margin-top:1rem;">
              <div style="flex:1; border:1px solid var(--border); border-radius:4px; padding:0.5rem; background:var(--panel);">
                <strong>Original Prompt (${esc(mismatch.model)})</strong>
                <pre style="white-space:pre-wrap; margin-top:0.5rem;">${esc(mismatch.samplePrompt)}</pre>
              </div>
              <div style="flex:1; border:1px solid var(--border); border-radius:4px; padding:0.5rem; background:var(--panel);">
                <strong>Replay Output (gpt-4o-mini)</strong>
                <pre style="white-space:pre-wrap; margin-top:0.5rem;">${esc(res)}</pre>
              </div>
            </div>
          `;
        } catch (err: any) {
          replayOutput.innerHTML = `<p style="color:var(--danger)">Error: ${esc(err.message)}</p>`;
        } finally {
          btnReplay.disabled = false;
          btnReplay.textContent = "Run Replay";
        }
      });
    }
  }, 0);
}

function fullReportHtml(
  audit: AuditResult,
  score: number,
  breakdown: { label: string; delta: number }[],
  roadmap: string[]
): string {
  const roadmapItems = roadmap.map((t) => `<li>${esc(t)}</li>`).join("");

  const breakdownHtml = breakdown
    .map(
      (b) =>
        `<tr><td>${esc(b.label)}</td><td class="num-cell" style="color:${b.delta < 0 ? "var(--danger)" : "var(--accent)"}">${b.delta > 0 ? "+" : ""}${b.delta}</td></tr>`
    )
    .join("");

  const dupRows = audit.duplicates
    .slice(0, 25)
    .map(
      (d) =>
        `<tr><td>${esc(d.promptPreview)}</td><td>${fmtNum(d.count)}</td><td>${fmtNum(d.wastedInputTokens)}</td><td>${esc(d.models.join(", "))}</td></tr>`
    )
    .join("");

  const semanticRows = audit.semanticClusters && audit.semanticClusters.length > 0 ? audit.semanticClusters
    .slice(0, 25)
    .map(
      (d) =>
        `<tr><td>${esc(d.clusterPreview)}</td><td>${fmtNum(d.count)}</td><td>${fmtNum(d.wastedInputTokens)}</td><td>${esc(d.models.join(", "))}</td></tr>`
    )
    .join("") : "";

  const runRows = audit.runaways
    .slice(0, 15)
    .map(
      (r) =>
        `<tr><td class="nowrap">${esc(r.start.toISOString())}</td><td>${fmtNum(r.requests)}</td><td>${fmtUSD(r.estCostUSD)}</td><td>${esc(r.peakModel ?? "—")}</td></tr>`
    )
    .join("");

  const mmRows = audit.modelMismatches
    .slice(0, 40)
    .map(
      (m) =>
        `<tr><td>${esc(m.model)}</td><td>${esc(m.suggestion)}</td><td>${esc(m.reason)}</td><td>${fmtUSD(m.approxSavingsUSD)}</td></tr>`
    )
    .join("");

  const roiBlock =
    audit.tokenROI != null
      ? `<div class="metric roi-metric honey-metric"><div class="lbl">Revenue per 1M tokens (rough)</div><div class="val">${fmtUSD(audit.tokenROI.perMillionTokens)}</div><p class="muted-note flush-b">From revenue you entered.</p></div>`
      : "";

  const scoreBody = `
    <p class="muted-note flush-b">Heuristic 0–100 — not a bureau score.</p>
    <div class="score-ring">
      <div class="score-num">${score}</div>
      <div class="score-table-wrap">
        <div class="table-wrap table-honey">
          <table><thead><tr><th>Factor</th><th class="num-col">Δ</th></tr></thead>
          <tbody>${breakdownHtml}</tbody></table>
        </div>
      </div>
    </div>
    ${roiBlock}
  `;

  const roadmapBody = `<ul class="roadmap roadmap--inset">${roadmapItems}</ul>`;

  const insightItems = audit.insights.map((i) => 
    `<li>${esc(i).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>')}</li>`
  ).join("");
  const insightsBody = `<ul class="roadmap roadmap--inset insights-list">${insightItems}</ul>`;

  const dupBody = `<div class="table-wrap table-honey">
        <table><thead><tr><th>Prompt preview</th><th>×</th><th>Dup input (est.)</th><th>Models</th></tr></thead>
        <tbody>${dupRows || `<tr><td colspan="4">None flagged.</td></tr>`}</tbody></table>
      </div>`;

  const semanticBody = `<div class="table-wrap table-honey">
        <p class="muted-note flush-b" style="margin-bottom:0.5rem">Prompts grouped by cosine similarity (all-MiniLM-L6-v2 embeddings) running locally.</p>
        <table><thead><tr><th>Cluster Theme</th><th>×</th><th>Dup input (est.)</th><th>Models</th></tr></thead>
        <tbody>${semanticRows || `<tr><td colspan="4">No semantic clusters computed or found.</td></tr>`}</tbody></table>
      </div>`;

  const runBody = `<div class="table-wrap table-honey">
        <table><thead><tr><th>Window (UTC)</th><th>Req</th><th>Est. USD</th><th>Peak model</th></tr></thead>
        <tbody>${runRows || `<tr><td colspan="4">None above threshold.</td></tr>`}</tbody></table>
      </div>`;

  const mmBody = `
    <p class="muted-note flush-b">Heuristic — verify quality before routing.</p>
    <div class="table-wrap table-honey">
        <table><thead><tr><th>Model</th><th>Idea</th><th>Why</th><th>Save/call</th></tr></thead>
        <tbody>${mmRows || `<tr><td colspan="4">None flagged.</td></tr>`}</tbody></table>
      </div>
    <p class="muted-note foot-tight">If all flags held: ~${fmtUSD(audit.potentialDowngradeSavingsUSD)} routing savings (illustrative).</p>`;

  const chartsBody = `
    <div class="charts-grid" style="display:flex; flex-wrap:wrap; gap: 2rem; margin-top: 1rem;">
      <div style="flex: 1 1 500px; min-width: 0;">
        <h4 style="margin-bottom: 0.5rem; color: var(--text);">Spend Timeline</h4>
        <div id="chart-timeline" style="width: 100%; min-height: 200px;"></div>
      </div>
      <div style="flex: 0 1 300px; min-width: 0; display:flex; flex-direction:column; align-items:center;">
        <h4 style="margin-bottom: 0.5rem; color: var(--text);">Model Spend Concentration</h4>
        <div id="chart-donut" style="width: 100%; max-width:300px; min-height: 300px;"></div>
      </div>
    </div>
  `;

  const promptOptions = audit.modelMismatches.map((m, i) => {
    const p = m.samplePrompt;
    const brief = p.length > 50 ? p.substring(0, 47) + "..." : p;
    return `<option value="${i}">[${m.model} -> ${m.suggestion}] ${esc(brief)}</option>`;
  }).join("");

  const abReplayBody = `
    <div class="panel honey-card" style="border:1px solid var(--border); box-shadow:none;">
      <p class="muted-note" style="margin-bottom:1rem;">Validate whether a cheaper model (e.g. gpt-4o-mini) can handle your prompts properly before switching.</p>
      
      <div class="field" style="margin-bottom:1rem;">
        <label for="ab-openai-key">OpenAI API Key (Local only)</label>
        <input type="password" id="ab-openai-key" placeholder="sk-..." />
      </div>

      <div class="field" style="margin-bottom:1rem;">
        <label for="ab-prompt-select">Select a mismatched prompt to replay</label>
        <select id="ab-prompt-select" style="width:100%; padding:0.5rem;">
          ${promptOptions || `<option value="">No mismatched prompts available</option>`}
        </select>
      </div>

      <button type="button" class="btn btn-honey" id="btn-ab-replay" ${promptOptions ? "" : "disabled"}>Run Replay</button>

      <div id="ab-replay-output" style="margin-top:1rem;"></div>
    </div>
  `;

  return [
    reportCollapse("insights", "Key Insights", "Automated takeaways", insightsBody, true),
    reportCollapse("charts", "Visualizations", "Timeline & Model Spend", chartsBody, true),
    reportCollapse("score", "Token Credit Score", "Heuristic · factor deltas", scoreBody, false),
    reportCollapse("roadmap", "Optimization roadmap", "What to do next", roadmapBody, false),
    reportCollapse("redundancy", "Semantic redundancy", "Exact-match repeated prompts", dupBody, false),
    reportCollapse("semantic", "Semantic Clustering", "Variations with similar meaning", semanticBody, false),
    reportCollapse("runaway", "Runaway signals", "Heavy 1-minute buckets", runBody, false),
    reportCollapse("mismatch", "Model mismatch candidates", "Cheaper tier ideas", mmBody, false),
    reportCollapse("abreplay", "A/B Testing Simulator", "Test cheaper models", abReplayBody, false),
  ].join("");
}

window.addEventListener("hashchange", () => void boot());

async function boot(): Promise<void> {
  render();
  initModelCatalog().catch(console.error);
}

void boot();
