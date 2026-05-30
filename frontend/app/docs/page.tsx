"use client";

import React, { useState } from "react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import {
  Terminal,
  Cpu,
  Settings,
  ShieldCheck,
  Check,
  Copy,
  ChevronRight,
  Code,
  Flame,
  RefreshCw,
  Sliders,
  ExternalLink,
  Bot,
  Target,
  Zap,
} from "lucide-react";

function CodeBlock({ code, language, id }: { code: string; language: string; id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <div className="relative group rounded-xl border border-white/[0.08] bg-[#0c0c0c] overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.02] text-xs font-mono text-white/40">
        <span>{language.toUpperCase()}</span>
        <button
          id={id}
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-[13px] text-white/80 leading-relaxed whitespace-pre select-all">
          {code}
        </pre>
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<"python" | "node">("node");
  const [activeSection, setActiveSection] = useState("overview");

  const sections = [
    { id: "overview", label: "Overview" },
    { id: "agent-cheatsheet", label: "AI agent cheat sheet" },
    { id: "quickstart", label: "Quick start" },
    { id: "autohook", label: "Zero-code hook" },
    { id: "integration", label: "Manual integration" },
    { id: "outcomes", label: "Success & failure" },
    { id: "guards", label: "Real-time guards" },
    { id: "heuristics", label: "Offline analysis" },
    { id: "cicd", label: "CI gate" },
  ];

  const nodeInstall = `npm install aurex-sdk`;
  const pythonInstall = `pip install -e sdk/python   # from repo root; package name: aurex-python`;

  const nodeHook = `# 1) Write .env.aurex in your project
npx aurex install-hook
source .env.aurex

# 2) Set your API key (from /app/api-keys)
export AUREX_API_KEY=aux_live_...

# Optional
export AUREX_BASE_URL=http://localhost:8000/api/v1
export AUREX_WORKFLOW_ID=my_agent

# 3) Run your app — OpenAI, Anthropic, LiteLLM calls are tracked
node your_app.js`;

  const nodeManual = `import { AurexAuditor } from "aurex-sdk";

const aurex = AurexAuditor.getInstance({
  apiKey: process.env.AUREX_API_KEY,
  cloudSync: true,           // on by default when apiKey is set
  baseUrl: "http://localhost:8000/api/v1",
  ledgerPath: ".aurex/ledger.jsonl",
});

// After each LLM call (or use patchAll() below)
aurex.logEvent({
  model: "gpt-4o-mini",
  inputTokens: 120,
  outputTokens: 40,
  workflowId: "checkout_agent",
});

aurex.flush();
process.on("SIGINT", () => { aurex.shutdown(); process.exit(0); });`;

  const nodePatch = `import { AurexAuditor } from "aurex-sdk";

const aurex = AurexAuditor.getInstance({ apiKey: process.env.AUREX_API_KEY });
aurex.patchAll();  // LiteLLM + Anthropic + OpenAI

// Calls are logged automatically. preCallCheck runs before each call.`;

  const nodeOutcomes = `import { AurexAuditor } from "aurex-sdk";

const aurex = AurexAuditor.getInstance({ apiKey: process.env.AUREX_API_KEY });

// Call these when your workflow finishes (not on every LLM call)
aurex.markSuccess("checkout_agent", { ticketId: "T-123" });
aurex.markFailure("checkout_agent", "timeout", { retries: 3 });

// Powers /app metrics: cost per successful outcome, success rate`;

  const nodeGuards = `import { AurexAuditor, applyDecisionToCallParams } from "aurex-sdk";

const aurex = AurexAuditor.getInstance({ apiKey: process.env.AUREX_API_KEY });

const decision = aurex.preCallCheck({
  model: "gpt-4o",
  prompt: "Say hi",
  workflowId: "my_agent",
  messages: [{ role: "user", content: "Say hi" }],
});

// decision.action: "proceed" | "downgrade" | "compress" | "block"
// decision.suggestedModel — cheaper model when downgrade
// decision.injectSystemInstruction — loop / context hints

const params = applyDecisionToCallParams(openaiParams, decision);

// Or use the helper:
// await aurex.wrap((p) => openai.chat.completions.create(p), () => openaiParams);

// Skip guards for one workflow:
aurex.ignore("my_agent");`;

  const nodeCi = `# Warn only (default) — prints markdown report
npx aurex ci --mode=warn --github-comment

# Fail CI on CRITICAL waste
npx aurex ci --mode=block

# Config: .aurex/config.json
# { "ci": { "mode": "warn", "max_waste_percentage": 30 } }`;

  const pythonManual = `from aurex import AurexAuditor, mark_success, mark_failure

auditor = AurexAuditor.get_instance(api_key="aux_live_...")

auditor.log_event(
    model="gpt-4o-mini",
    input_tokens=100,
    output_tokens=50,
    workflow_id="my_agent",
)

mark_success("my_agent", {"order_id": "123"})
mark_failure("my_agent", "timeout", {"retries": 2})`;

  const pythonPatch = `from aurex import patch_openai, patch_anthropic, patch_litellm

patch_openai()    # optional: install openai
patch_anthropic() # optional: install anthropic
patch_litellm()   # optional: install litellm

# Then use providers normally — events sync when AUREX_API_KEY is set`;

  const nodeHeuristics = `// LocalHeuristicsEngine lives in sdk/node/src/heuristics.ts
// Not exported from the npm package main entry yet.
// Use CI instead for pipelines:
npx aurex ci --mode=warn`;

  return (
    <main className="min-h-screen bg-[#030303] text-foreground font-sans relative overflow-x-hidden">
      <SEOHead />
      <Navigation />

      <div className="relative pt-32 pb-12 border-b border-white/[0.05] bg-gradient-to-b from-indigo-500/[0.02] via-transparent to-transparent">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">SDK v0.1</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight text-white mb-2">
              Aurex SDK docs
            </h1>
            <p className="text-base text-white/50 max-w-xl">
              Track LLM cost locally, sync metadata to your project, and catch waste before it hits your bill.
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-[#0a0a0a] max-w-sm">
            <Bot className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-white">For AI coding agents</h4>
              <p className="text-xs text-white/40 mt-1 mb-2 leading-relaxed">
                Load <code className="text-indigo-400">/llms.txt</code> or jump to the cheat sheet below.
              </p>
              <a
                href="/llms.txt"
                target="_blank"
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
              >
                Open /llms.txt
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          <aside className="w-full lg:w-64 shrink-0">
            <div className="sticky top-28 space-y-6">
              <div className="space-y-1">
                <span className="text-xs font-mono text-white/30 uppercase tracking-widest block px-3 mb-2">
                  On this page
                </span>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all ${
                      activeSection === section.id
                        ? "bg-white/[0.05] text-white border-l-2 border-emerald-500 pl-4 font-semibold"
                        : "text-white/40 hover:text-white/80"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] text-xs text-white/45 space-y-2">
                <p>
                  <strong className="text-white/70">Node package:</strong> <code>aurex-sdk</code>
                </p>
                <p>
                  <strong className="text-white/70">Python package:</strong> <code>aurex</code> (repo:{" "}
                  <code>sdk/python</code>)
                </p>
                <p>
                  <strong className="text-white/70">Cloud ingest:</strong>{" "}
                  <code>POST /api/v1/ledger/events</code>
                </p>
                <p>
                  <strong className="text-white/70">Dashboard:</strong> <a href="/app" className="text-emerald-400 hover:underline">/app</a>
                </p>
              </div>
            </div>
          </aside>

          <div className="flex-1 space-y-16 max-w-4xl">
            {/* Overview */}
            <section id="overview" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                Overview
              </h2>
              <div className="text-white/60 space-y-4 leading-relaxed">
                <p>
                  Aurex watches your LLM calls. It writes a local file (<code className="text-indigo-400">.aurex/ledger.jsonl</code>
                  ), optionally sends <strong className="text-white/80">metadata only</strong> to the backend (tokens, model, cost, hashes — not raw prompts unless you opt in).
                </p>
                <p>
                  <strong className="text-white/80">Node.js</strong> is the most complete SDK today: auto-hooks, real-time guards, outcomes, and CI.
                  <strong className="text-white/80"> Python</strong> supports logging, patches, and outcome helpers.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: "Local first", desc: "Ledger on disk. Cloud sync is optional.", icon: ShieldCheck },
                  { title: "Project scoped", desc: "Use API keys from /app/api-keys (aux_live_*).", icon: Target },
                  { title: "Acts before calls", desc: "Downgrade, compress, or warn — in-process, no extra HTTP.", icon: Zap },
                ].map((item, idx) => (
                  <div key={idx} className="p-5 rounded-xl border border-white/[0.05] bg-white/[0.01]">
                    <item.icon className="w-5 h-5 text-emerald-400 mb-2" />
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="text-xs text-white/40 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Agent cheat sheet */}
            <section id="agent-cheatsheet" className="scroll-mt-32 space-y-4">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                AI agent cheat sheet
              </h2>
              <p className="text-white/60 text-sm">
                Copy this block when wiring Aurex in a codebase. Paths are relative to the tbank monorepo.
              </p>
              <CodeBlock
                id="copy-agent-cheatsheet"
                language="text"
                code={`# === AUREX SDK — QUICK FACTS FOR AGENTS ===

# Install
#   Node: npm install aurex-sdk  (source: sdk/node/)
#   Python: pip install -e sdk/python  (import: from aurex import ...)

# Required for cloud + /app dashboard
#   AUREX_API_KEY=aux_live_...   # create at /app/api-keys
#   AUREX_BASE_URL=http://localhost:8000/api/v1

# Node zero-code
#   npx aurex install-hook && source .env.aurex
#   Needs AUREX_API_KEY (AUREX_ENABLED=1 in .env.aurex is fine)
#   Hook file: sdk/node/src/hook.ts → dist/hook.js

# Node API (AurexAuditor.getInstance)
#   logEvent({ model, inputTokens, outputTokens, workflowId, ... })
#   markSuccess(workflowId, metadata?)
#   markFailure(workflowId, reason?, metadata?)
#   preCallCheck(...) → AurexDecision { action, suggestedModel, reason, ... }
#   patchAll() | patchOpenAI() | patchAnthropic() | patchLiteLLM()
#   wrap(callFn, buildParams)  ignore(workflowId?)
#   flush()  shutdown()

# Cloud endpoint (default)
#   POST {baseUrl}/ledger/events  body: { events: [...] }
#   Legacy keys ax_live_* need project_id on the key row for ledger ingest

# Backend (for context)
#   backend/src/services/ledger.py — ingest_events
#   backend/src/api/dashboard.py — /dashboard/overview (JWT + project scope)
#   frontend/app/app/page.tsx — live dashboard

# CI
#   npx aurex ci --mode=warn|block --github-comment
#   .aurex/config.json → { "ci": { "max_waste_percentage": 30 } }`}
              />
            </section>

            {/* Quick start */}
            <section id="quickstart" className="scroll-mt-32 space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  Quick start
                </h2>
                <div className="flex bg-white/[0.03] border border-white/[0.05] rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab("node")}
                    className={`px-3 py-1 text-sm rounded-md ${activeTab === "node" ? "bg-white/[0.08] text-white" : "text-white/45"}`}
                  >
                    Node.js
                  </button>
                  <button
                    onClick={() => setActiveTab("python")}
                    className={`px-3 py-1 text-sm rounded-md ${activeTab === "python" ? "bg-white/[0.08] text-white" : "text-white/45"}`}
                  >
                    Python
                  </button>
                </div>
              </div>

              <CodeBlock id="copy-install" code={activeTab === "node" ? nodeInstall : pythonInstall} language="bash" />

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-3 text-sm text-white/50">
                <h4 className="text-white font-semibold">Environment variables</h4>
                <ul className="space-y-2 font-mono text-xs">
                  <li>
                    <strong className="text-white/70">AUREX_API_KEY</strong> — Required for cloud sync. Get from{" "}
                    <a href="/app/api-keys" className="text-emerald-400 hover:underline">/app/api-keys</a>. Prefer{" "}
                    <code className="text-indigo-400">aux_live_...</code> (project-scoped). Legacy{" "}
                    <code className="text-indigo-400">ax_live_...</code> works if the key is linked to a project.
                  </li>
                  <li>
                    <strong className="text-white/70">AUREX_BASE_URL</strong> — Default{" "}
                    <code className="text-indigo-400">http://localhost:8000/api/v1</code>
                  </li>
                  <li>
                    <strong className="text-white/70">AUREX_WORKFLOW_ID</strong> — Labels a workflow in logs (Node hook uses this as project label).
                  </li>
                  <li>
                    <strong className="text-white/70">AUREX_ENABLED</strong> — Node: set to <code className="text-indigo-400">0</code> to disable hook. Otherwise only <code className="text-indigo-400">AUREX_API_KEY</code> is required.
                  </li>
                  <li>
                    <strong className="text-white/70">AUREX_BLOCK_ON_WASTE</strong> — Set to <code className="text-indigo-400">1</code> to throw on guard violations.
                  </li>
                  <li>
                    <strong className="text-white/70">AUREX_DEBUG</strong> — Set to <code className="text-indigo-400">1</code> for hook debug logs on stderr.
                  </li>
                </ul>
              </div>

              {activeTab === "node" && (
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-2 text-sm text-white/50">
                  <h4 className="text-white font-semibold">AurexConfig (Node)</h4>
                  <ul className="font-mono text-xs space-y-1">
                    <li><code>apiKey</code> — enables cloud when set</li>
                    <li><code>cloudSync</code> — default true if apiKey is set</li>
                    <li><code>localOnly</code> — default false if apiKey is set</li>
                    <li><code>ledgerPath</code> — default <code>.aurex/ledger.jsonl</code></li>
                    <li><code>baseUrl</code> — API root including <code>/api/v1</code></li>
                    <li><code>budgetGuard</code> — optional spend limits per minute / session</li>
                  </ul>
                </div>
              )}
            </section>

            {/* Zero-code hook */}
            <section id="autohook" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Zero-code hook
              </h2>
              <p className="text-white/60 leading-relaxed">
                No imports in your app. The hook patches OpenAI, Anthropic, and LiteLLM when those packages are installed.
                Events show up on the <a href="/app" className="text-emerald-400 hover:underline">/app</a> dashboard within about 30 seconds.
              </p>

              {activeTab === "node" ? (
                <CodeBlock id="copy-node-hook" code={nodeHook} language="bash" />
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-white/60">
                  Python zero-code site-packages hook is not shipped yet. Use manual patches:
                  <CodeBlock id="copy-python-hook" code={pythonPatch} language="python" />
                  Set <code className="text-indigo-400">AUREX_API_KEY</code> in the environment so{" "}
                  <code className="text-indigo-400">AurexAuditor</code> syncs to the cloud.
                </div>
              )}

              <p className="text-xs text-white/40">
                Uninstall Node hook: <code className="text-indigo-400">npx aurex uninstall-hook</code>
              </p>
            </section>

            {/* Manual integration */}
            <section id="integration" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-rose-400" />
                Manual integration
              </h2>
              {activeTab === "node" ? (
                <>
                  <CodeBlock id="copy-node-manual" code={nodeManual} language="typescript" />
                  <h3 className="text-sm font-semibold text-white">Auto-patch providers</h3>
                  <CodeBlock id="copy-node-patch" code={nodePatch} language="typescript" />
                </>
              ) : (
                <>
                  <CodeBlock id="copy-python-manual" code={pythonManual} language="python" />
                  <h3 className="text-sm font-semibold text-white">Auto-patch providers</h3>
                  <CodeBlock id="copy-python-patch" code={pythonPatch} language="python" />
                </>
              )}
              <p className="text-sm text-white/50">
                Prompts and responses are hashed locally (SHA-256) before logging. Raw text is not sent to the cloud unless you pass it and enable hash sync via config.
              </p>
            </section>

            {/* Outcomes */}
            <section id="outcomes" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Success & failure signals
              </h2>
              <p className="text-white/60 leading-relaxed">
                LLM calls alone do not know if a workflow succeeded. Call <code className="text-indigo-400">markSuccess</code> or{" "}
                <code className="text-indigo-400">markFailure</code> once per workflow when the job finishes. These emit lightweight{" "}
                <code className="text-indigo-400">outcome_signal</code> events so the dashboard can show success rate and cost per successful outcome.
              </p>
              {activeTab === "node" ? (
                <CodeBlock id="copy-node-outcomes" code={nodeOutcomes} language="typescript" />
              ) : (
                <CodeBlock
                  id="copy-python-outcomes"
                  language="python"
                  code={`from aurex import mark_success, mark_failure

mark_success("checkout_agent", {"ticket_id": "T-123"})
mark_failure("checkout_agent", "timeout", {"retries": 3})`}
                />
              )}
            </section>

            {/* Real-time guards */}
            <section id="guards" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Real-time guards (Node)
              </h2>
              <p className="text-white/60 leading-relaxed">
                <code className="text-indigo-400">preCallCheck()</code> runs in your process before each call (no network). It returns an{" "}
                <code className="text-indigo-400">AurexDecision</code>. Auto-patchers apply downgrade and compress automatically.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  { action: "proceed", desc: "No change needed." },
                  { action: "downgrade", desc: "Swap to a cheaper model (e.g. gpt-4o → gpt-4o-mini)." },
                  { action: "compress", desc: "Remove duplicate system messages in the chat payload." },
                  { action: "block", desc: "Throw if AUREX_BLOCK_ON_WASTE=1." },
                ].map((row) => (
                  <div key={row.action} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.01]">
                    <code className="text-emerald-400">{row.action}</code>
                    <p className="text-white/45 text-xs mt-1">{row.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/50">Detectors include: system prompt waste, runaway context growth, expensive model on tiny prompts, context explosion, semantic loops (n-gram similarity), and budget-based downgrade.</p>
              {activeTab === "node" && <CodeBlock id="copy-node-guards" code={nodeGuards} language="typescript" />}
              {activeTab === "python" && (
                <p className="text-sm text-amber-400/90">preCallCheck / AurexDecision are Node-only today. Use the backend detection engine on uploaded CSVs for Python-only stacks.</p>
              )}
            </section>

            {/* Offline heuristics */}
            <section id="heuristics" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                Offline analysis
              </h2>
              <p className="text-white/60">
                Scan <code className="text-indigo-400">.aurex/ledger.jsonl</code> for waste patterns. Prefer{" "}
                <code className="text-indigo-400">aurex ci</code> in CI; use the backend engine for full audit reports on{" "}
                <a href="/audit" className="text-emerald-400 hover:underline">/audit</a>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {[
                  "System prompt waste (repeated system prompts)",
                  "Agent runaway loops (context grows fast)",
                  "Expensive model misuse (big model, small task)",
                  "Context explosion (total context 3.5×+)",
                  "Semantic loops (Node guards — similar replies)",
                  "Retry cascades (backend engine on uploads)",
                ].map((title) => (
                  <div key={title} className="p-3 rounded-lg border border-white/[0.06] text-white/50">
                    {title}
                  </div>
                ))}
              </div>
              {activeTab === "node" && <CodeBlock id="copy-heuristics" code={nodeHeuristics} language="bash" />}
            </section>

            {/* CI */}
            <section id="cicd" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
                CI gate (Node)
              </h2>
              <p className="text-white/60">
                Fail or warn on retry-heavy spend in your local ledger. Use in GitHub Actions via{" "}
                <code className="text-indigo-400">.github/actions/aurex-ci</code> in this repo.
              </p>
              <CodeBlock id="copy-ci" code={nodeCi} language="bash" />
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-sm text-white/60">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-white">
                      <th className="p-3 text-left">Flag / config</th>
                      <th className="p-3 text-left">Default</th>
                      <th className="p-3 text-left">Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
                    <tr>
                      <td className="p-3 text-indigo-400">--mode warn</td>
                      <td className="p-3">yes</td>
                      <td className="p-3 font-sans">Print report; exit 0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">--mode block</td>
                      <td className="p-3">—</td>
                      <td className="p-3 font-sans">Exit 1 if any CRITICAL issue</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">--github-comment</td>
                      <td className="p-3">off</td>
                      <td className="p-3 font-sans">Markdown for PR comments</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">ci.max_waste_percentage</td>
                      <td className="p-3">30</td>
                      <td className="p-3 font-sans">In .aurex/config.json</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>

      <FooterSection />
    </main>
  );
}

function SEOHead() {
  return (
    <>
      <title>Aurex SDK Documentation — LLM cost tracking & guards</title>
      <meta
        name="description"
        content="Aurex SDK docs: zero-code Node hook, markSuccess/markFailure, real-time guards, cloud sync to /app dashboard, and CI waste gate."
      />
    </>
  );
}
