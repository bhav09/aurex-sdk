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
  Bot
} from "lucide-react";

// Copy code component
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
  const [activeTab, setActiveTab] = useState<"python" | "node">("python");
  const [activeSection, setActiveSection] = useState("overview");

  const sections = [
    { id: "overview", label: "Overview & Philosophy" },
    { id: "quickstart", label: "Quick Start" },
    { id: "autohook", label: "Zero-Code Hook" },
    { id: "integration", label: "SDK Integration" },
    { id: "heuristics", label: "Offline Heuristics" },
    { id: "cicd", label: "CI/CD Build Breaker" }
  ];

  const pythonInstallCode = `pip install aurex-sdk`;
  const nodeInstallCode = `npm install aurex-sdk`;

  const pythonAutoHookCode = `# Install the zero-code import hook (writes to site-packages)
aurex install-hook

# Set env vars — that's it. No code changes needed.
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_...      # from /app/api-keys
export AUREX_BASE_URL=https://your-backend.run.app/api/v1   # optional

# Run your app — every LLM call is tracked automatically
python your_app.py`;

  const nodeAutoHookCode = `# Install the zero-code require hook
npx aurex install-hook

# Set env vars
AUREX_ENABLED=1 AUREX_API_KEY=aux_dev_... node your_app.js`;

  const pythonUsageCode = `from aurex_sdk import AurexAuditor, AurexConfig

# Initialize with custom local-first configurations
config = AurexConfig(
    project="customer-chatbot",
    ledger_path=".aurex/ledger.jsonl",
    local_only=True
)
auditor = AurexAuditor(config)

# Log LLM events asynchronously (zero performance overhead)
auditor.log_event(
    model="gpt-4o",
    prompt="Generate a response about pricing.",
    response="Here is our billing info...",
    input_tokens=140,
    output_tokens=85,
    workflow_id="session_user_8492"
)`;

  const pythonPatchAllCode = `from aurex_sdk import AurexAuditor
import openai, anthropic, litellm

auditor = AurexAuditor()

# Patch all supported providers at once (litellm → anthropic → openai → google)
auditor.patch_all()

# Or patch individually:
# auditor.patch_litellm()     # LiteLLM (covers most providers via one hook)
# auditor.patch_openai()      # OpenAI / Azure OpenAI
# auditor.patch_anthropic()   # Anthropic Claude
# auditor.patch_google()      # Google Gemini

# All subsequent LLM calls are monitored automatically
response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Analyze my project"}]
)`;

  const pythonContextManagerCode = `with AurexAuditor() as auditor:
    auditor.log_event(
        model="gemini-2.0-flash",
        input_tokens=250,
        output_tokens=100
    )`;

  const nodeUsageCode = `import { AurexAuditor } from "aurex-sdk";

// Initialize the singleton instance
const auditor = AurexAuditor.getInstance({
  project: "node-agent",
  ledgerPath: ".aurex/ledger.jsonl",
  localOnly: true
});

// Record event asynchronously (prompts/responses are hashed locally)
auditor.logEvent({
  model: "claude-3-5-sonnet",
  prompt: "Synthesize this code block.",
  response: "Here is the summary.",
  inputTokens: 520,
  outputTokens: 180,
  workflowId: "wf_agent_9281"
});

// Make sure to shutdown/flush before exit
process.on("SIGINT", () => {
  auditor.shutdown();
  process.exit(0);
});`;

  const pythonCliCode = `python -m aurex_sdk.cli \\
  --ledger .aurex/ledger.jsonl \\
  --fail-under 80 \\
  --max-waste-usd 10.00 \\
  --max-spend-usd 250.00`;

  const programHeuristicsPython = `from aurex_sdk.heuristics import LocalHeuristicsEngine

engine = LocalHeuristicsEngine(".aurex/ledger.jsonl")
report = engine.analyze()

print(f"Token Credit Score: {report['credit_score']}/100")
print(f"Total Wasted USD: \${report['wasted_cost']}")`;

  const programHeuristicsNode = `import { LocalHeuristicsEngine } from "@aurex/sdk/heuristics";

const engine = new LocalHeuristicsEngine(".aurex/ledger.jsonl");
const report = engine.analyze();

console.log(\`Credit Score: \${report.credit_score}/100\`);
console.log(\`Wasted Spend: \$\${report.wasted_cost}\`);`;

  return (
    <main className="min-h-screen bg-[#030303] text-foreground font-sans relative overflow-x-hidden">
      <SEOHead />
      <Navigation />

      {/* Hero Header Space */}
      <div className="relative pt-32 pb-12 border-b border-white/[0.05] bg-gradient-to-b from-indigo-500/[0.02] via-transparent to-transparent">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Local-First SDK</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight text-white mb-2">
              Aurex SDK Documentation
            </h1>
            <p className="text-base text-white/50 max-w-xl">
              Zero-trust, local-first cost tracking and credit score optimization for your LLM pipelines.
            </p>
          </div>

          {/* AI Agent Callout */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-[#0a0a0a] max-w-sm">
            <Bot className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-white">AI Agent Reference</h4>
              <p className="text-xs text-white/40 mt-1 mb-2 leading-relaxed">
                Using Cursor, Claude, or Gemini? Load our reference sheet directly into context.
              </p>
              <a 
                id="agent-reference-btn"
                href="/llms.txt" 
                target="_blank" 
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 group"
              >
                Open /llms.txt
                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Docs Body Content */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Desktop Sidebar navigation */}
          <aside className="w-full lg:w-64 shrink-0 block">
            <div className="sticky top-28 space-y-6">
              <div className="space-y-1">
                <span className="text-xs font-mono text-white/30 uppercase tracking-widest block px-3 mb-2">
                  Navigation
                </span>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      const element = document.getElementById(section.id);
                      if (element) {
                        element.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-all duration-300 ${
                      activeSection === section.id
                        ? "bg-white/[0.05] text-white border-l-2 border-emerald-500 pl-4 font-semibold"
                        : "text-white/40 hover:text-white/80 hover:bg-white/[0.02]"
                    }`}
                  >
                    <span>{section.label}</span>
                    <ChevronRight className={`w-3 h-3 transition-transform ${activeSection === section.id ? "rotate-90" : "opacity-0 group-hover:opacity-100"}`} />
                  </button>
                ))}
              </div>

              {/* Quick Info Box */}
              <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-3">
                <h5 className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Local Control by Default
                </h5>
                <p className="text-xs text-white/40 leading-relaxed">
                  Local SDK ledger by default. Metadata-only sync. Plaintext never sent unless explicitly opted in.
                </p>
              </div>
            </div>
          </aside>

          {/* Main Docs Section */}
          <div className="flex-1 space-y-16 max-w-4xl">
            
            {/* Section 1: Overview & Philosophy */}
            <section id="overview" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Cpu className="w-5 h-5" />
                </span>
                Overview & Philosophy
              </h2>
              <div className="text-base text-white/60 space-y-4 leading-relaxed">
                <p>
                  Aurex SDK logs LLM token usage into a local JSONL ledger and runs offline diagnostics to detect wasteful patterns — loops, over-provisioned models, and context explosions — without sending any data externally.
                </p>
              </div>

              {/* Three Pillards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {[
                  {
                    title: "Local Control",
                    desc: "Metadata-only sync by default. Cloud opt-in and project-scoped.",
                    icon: ShieldCheck
                  },
                  {
                    title: "Async Queue",
                    desc: "Background workers with <0.1ms main thread overhead.",
                    icon: Terminal
                  },
                  {
                    title: "Local Audits",
                    desc: "Credit Scores and waste diagnostics run entirely offline.",
                    icon: Sliders
                  }
                ].map((item, idx) => (
                  <div key={idx} className="p-5 rounded-xl border border-white/[0.05] bg-white/[0.01] hover:border-white/[0.08] transition-all">
                    <item.icon className="w-6 h-6 text-emerald-400 mb-3" />
                    <h3 className="text-sm font-semibold text-white mb-1.5">{item.title}</h3>
                    <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Quick Start */}
            <section id="quickstart" className="scroll-mt-32 space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Settings className="w-5 h-5" />
                  </span>
                  Quick Start
                </h2>
                
                {/* Language Tab buttons */}
                <div className="flex bg-white/[0.03] border border-white/[0.05] rounded-lg p-0.5" id="lang-switch-container">
                  <button
                    id="btn-switch-python"
                    onClick={() => setActiveTab("python")}
                    className={`px-3 py-1 text-sm rounded-md font-medium transition-all ${
                      activeTab === "python"
                        ? "bg-white/[0.08] text-white"
                        : "text-white/45 hover:text-white"
                    }`}
                  >
                    Python
                  </button>
                  <button
                    id="btn-switch-node"
                    onClick={() => setActiveTab("node")}
                    className={`px-3 py-1 text-sm rounded-md font-medium transition-all ${
                      activeTab === "node"
                        ? "bg-white/[0.08] text-white"
                        : "text-white/45 hover:text-white"
                    }`}
                  >
                    Node.js
                  </button>
                </div>
              </div>

              {activeTab === "python" ? (
                <div className="space-y-4">
                  <p className="text-base text-white/60">
                    Install via pip:
                  </p>
                  <CodeBlock 
                    id="copy-python-install" 
                    code={pythonInstallCode} 
                    language="bash" 
                  />
                  <p className="text-base text-white/60">
                    Configure programmatically or via environment variables:
                  </p>
                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-white">Environment Variables:</h4>
                    <ul className="space-y-2 text-sm text-white/45 font-mono">
                      <li><strong className="text-white/70">AUREX_ENABLED</strong> - Set to <code className="text-indigo-400">1</code> to activate the auto-hook.</li>
                      <li><strong className="text-white/70">AUREX_API_KEY</strong> - API key for cloud sync. Format: <code className="text-indigo-400">aux_dev_...</code> (from <a href="/app/api-keys" className="text-emerald-400 hover:underline">/app/api-keys</a>).</li>
                      <li><strong className="text-white/70">AUREX_BASE_URL</strong> - Backend URL (defaults to <code className="text-indigo-400">http://localhost:8000/api/v1</code>).</li>
                      <li><strong className="text-white/70">AUREX_PROJECT</strong> - Labels logged workloads.</li>
                      <li><strong className="text-white/70">AUREX_LEDGER_PATH</strong> - JSONL target path (defaults to <code className="text-indigo-400">.aurex/ledger.jsonl</code>).</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-base text-white/60">
                    Install via npm:
                  </p>
                  <CodeBlock 
                    id="copy-node-install" 
                    code={nodeInstallCode} 
                    language="bash" 
                  />
                  <p className="text-base text-white/60">
                    Configuration parameters:
                  </p>
                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-white">AurexConfig options:</h4>
                    <ul className="space-y-2 text-sm text-white/45 font-mono">
                      <li><strong className="text-white/70">apiKey?: string</strong> - API key. Format: <code className="text-indigo-400">aux_dev_...</code></li>
                      <li><strong className="text-white/70">project?: string</strong> - Project label.</li>
                      <li><strong className="text-white/70">baseUrl?: string</strong> - Backend base URL (defaults to localhost).</li>
                      <li><strong className="text-white/70">ledgerPath?: string</strong> - JSONL log path (Default: <code className="text-indigo-400">.aurex/ledger.jsonl</code>).</li>
                      <li><strong className="text-white/70">localOnly?: boolean</strong> - Disable cloud sync (Default: <code className="text-indigo-400">true</code>).</li>
                      <li><strong className="text-white/70">flushIntervalMs?: number</strong> - Flush interval in ms (Default: <code className="text-indigo-400">30000</code>).</li>
                      <li><strong className="text-white/70">maxBatchSize?: number</strong> - Events per batch (Default: <code className="text-indigo-400">100</code>).</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Zero-Code Hook */}
            <section id="autohook" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Terminal className="w-5 h-5" />
                </span>
                Zero-Code Hook
              </h2>
              <p className="text-base text-white/60 leading-relaxed">
                The fastest way to start tracking. Install once, set two env vars, run your app — no code changes needed.
                All LiteLLM, OpenAI, Anthropic, and Gemini calls are intercepted automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { step: "1", title: "Install hook", desc: "Writes a .pth file to site-packages that auto-imports on every Python start." },
                  { step: "2", title: "Set env vars", desc: "AUREX_ENABLED=1 activates the hook. AUREX_API_KEY links events to your project." },
                  { step: "3", title: "Run your app", desc: "Events appear in /app dashboard within 30 seconds. No SDK import needed." }
                ].map((item) => (
                  <div key={item.step} className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-2">
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Step {item.step}</span>
                    <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                    <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              {activeTab === "python" ? (
                <CodeBlock id="copy-python-autohook" code={pythonAutoHookCode} language="bash" />
              ) : (
                <CodeBlock id="copy-node-autohook" code={nodeAutoHookCode} language="bash" />
              )}

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
                <span className="text-amber-400 text-lg mt-0.5">⚡</span>
                <p className="text-sm text-white/60 leading-relaxed">
                  To uninstall: run <code className="text-indigo-400">aurex uninstall-hook</code>. The hook only activates
                  when <code className="text-indigo-400">AUREX_ENABLED=1</code> is set, so it is safe to leave installed in dev environments.
                </p>
              </div>
            </section>

            {/* Section 4: SDK Integration */}
            <section id="integration" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Code className="w-5 h-5" />
                </span>
                SDK Integration
              </h2>

              {activeTab === "python" ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Method A: Manual Event Logging
                    </h3>
                    <p className="text-base text-white/60">
                      Log cost records after each LLM call. Works with any framework including LangChain and LlamaIndex.
                    </p>
                    <CodeBlock 
                      id="copy-python-manual" 
                      code={pythonUsageCode} 
                      language="python" 
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-white/[0.05]">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Method B: Context Manager
                    </h3>
                    <p className="text-base text-white/60">
                      Guarantees clean queue flushes on shutdown.
                    </p>
                    <CodeBlock 
                      id="copy-python-ctx" 
                      code={pythonContextManagerCode} 
                      language="python" 
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-white/[0.05]">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Method C: Auto-Patching (all providers)
                    </h3>
                    <p className="text-base text-white/60">
                      Monkey-patches the provider SDK at the call site. Supports LiteLLM, OpenAI, Anthropic, and Google Gemini.
                      Use <code className="text-indigo-400">patch_all()</code> to cover all at once.
                    </p>
                    <CodeBlock
                      id="copy-python-patch"
                      code={pythonPatchAllCode}
                      language="python"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Manual Event Logging
                    </h3>
                    <p className="text-base text-white/60">
                      Call <code className="text-indigo-400">logEvent()</code> to record events. Buffered and batched automatically.
                      Package name: <code className="text-indigo-400">aurex-sdk</code>.
                    </p>
                    <CodeBlock
                      id="copy-node-manual"
                      code={nodeUsageCode}
                      language="typescript"
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-white/[0.05]">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Auto-Patching
                    </h3>
                    <p className="text-base text-white/60">
                      Use <code className="text-indigo-400">patchAll()</code> to monkey-patch LiteLLM, Anthropic, and OpenAI in one call.
                    </p>
                    <CodeBlock
                      id="copy-node-patch"
                      code={`import { AurexAuditor } from "aurex-sdk";\n\nconst auditor = AurexAuditor.getInstance({ apiKey: "aux_dev_..." });\n\n// Covers LiteLLM → Anthropic → OpenAI\nauditor.patchAll();\n\n// Or individually:\n// auditor.patchLiteLLM();\n// auditor.patchAnthropic();\n// auditor.patchOpenAI();`}
                      language="typescript"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Section 5: Heuristics */}
            <section id="heuristics" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Flame className="w-5 h-5" />
                </span>
                Offline Heuristics Engine
              </h2>
              <p className="text-base text-white/60 leading-relaxed">
                Runs offline against your ledger to flag cost issues and waste patterns:
              </p>

              {/* Heuristics Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: "System Prompt Waste",
                    sev: "CRITICAL",
                    sevColor: "text-red-400 bg-red-400/10 border-red-500/20",
                    desc: "Detects repeated identical system prompts across sessions. Recommends prompt caching.",
                    impact: "High Cost Impact"
                  },
                  {
                    title: "Agent Runaway Loops",
                    sev: "CRITICAL",
                    sevColor: "text-red-400 bg-red-400/10 border-red-500/20",
                    desc: "Triggered when context grows >2.5x consecutively across 3+ queries in a session.",
                    impact: "Critical Budget Risk"
                  },
                  {
                    title: "Expensive Model Misuse",
                    sev: "HIGH",
                    sevColor: "text-amber-400 bg-amber-400/10 border-amber-500/20",
                    desc: "Flags expensive models (GPT-4, Opus) used for simple queries. Suggests cheaper alternatives.",
                    impact: "Up to 90% Savings"
                  },
                  {
                    title: "Context Explosion",
                    sev: "HIGH",
                    sevColor: "text-amber-400 bg-amber-400/10 border-amber-500/20",
                    desc: "Flags sessions where context grows >= 2x from baseline. Recommends sliding windows.",
                    impact: "Performance & Cost Optimization"
                  }
                ].map((heur, idx) => (
                  <div key={idx} className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.02] transition-colors space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold text-white">{heur.title}</h4>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${heur.sevColor}`}>
                        {heur.sev}
                      </span>
                    </div>
                    <p className="text-sm text-white/50 leading-relaxed">{heur.desc}</p>
                    <div className="text-xs font-mono text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded inline-block">
                      Impact: {heur.impact}
                    </div>
                  </div>
                ))}
              </div>

              {/* Programmatic Analysis Code */}
              <div className="pt-4 space-y-3">
                <h4 className="text-base font-semibold text-white">
                  Programmatic Analysis
                </h4>
                <p className="text-base text-white/60">
                  Run diagnostics inside your test suite or scripts:
                </p>
                <CodeBlock
                  id="copy-program-heuristics"
                  code={activeTab === "python" ? programHeuristicsPython : programHeuristicsNode}
                  language={activeTab === "python" ? "python" : "javascript"}
                />
              </div>
            </section>

            {/* Section 6: CI/CD Build Breaker */}
            <section id="cicd" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <RefreshCw className="w-5 h-5 animate-spin-slow" />
                </span>
                CI/CD Build Breaker
              </h2>
              <div className="text-base text-white/60 space-y-4 leading-relaxed">
                <p>
                  Run the Aurex CLI in your CI pipeline (GitHub Actions, GitLab CI) to enforce cost policies. Default is warn-only. Use --mode=block to hard-fail the build on cost threshold breaches.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Example CLI Command:
                </h4>
                <CodeBlock 
                  id="copy-cli-command" 
                  code={pythonCliCode} 
                  language="bash" 
                />
                
                <h4 className="text-sm font-semibold text-white pt-4">CLI Options:</h4>
                <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                  <table className="w-full text-left border-collapse text-sm text-white/60">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-white/[0.02] text-white">
                        <th className="p-3 font-semibold">Flag</th>
                        <th className="p-3 font-semibold">Default</th>
                        <th className="p-3 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      <tr>
                        <td className="p-3 font-mono text-indigo-400 font-semibold">--ledger &lt;path&gt;</td>
                        <td className="p-3 font-mono">.aurex/ledger.jsonl</td>
                        <td className="p-3">Path to the generated JSONL log database file.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-indigo-400 font-semibold font-semibold">--mode &lt;warn|block&gt;</td>
                        <td className="p-3 font-mono">warn</td>
                        <td className="p-3">warn: print alerts only. block: fail build on threshold breach.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-indigo-400 font-semibold">--max-waste-usd &lt;amount&gt;</td>
                        <td className="p-3 font-mono">inf</td>
                        <td className="p-3">Fails build if calculated wasted spend exceeds this USD amount.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-indigo-400 font-semibold">--max-spend-usd &lt;amount&gt;</td>
                        <td className="p-3 font-mono">inf</td>
                        <td className="p-3">Fails build if total ledger spend exceeds this USD budget.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
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
      <title>Aurex SDK Documentation - AI Token Usage & Cost Auditing</title>
      <meta 
        name="description" 
        content="Install and integrate the Aurex SDK for zero-PII, local-first LLM cost auditing. Supports Python and Node.js with built-in CI/CD build breakers." 
      />
    </>
  );
}
