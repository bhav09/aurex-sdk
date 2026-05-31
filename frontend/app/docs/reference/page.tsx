"use client";

import React from "react";
import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Terminal,
  Cpu,
  Settings,
  ShieldCheck,
  Flame,
  RefreshCw,
  Sliders,
  Code,
  Target,
  Zap,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

export default function DocsReferencePage() {
  const pythonInstallCode = `pip install aurex-sdk`;
  const nodeInstallCode = `npm install aurex-sdk`;

  const pythonHookCode = `# 1) Install the hook into your site-packages
aurex install-hook

# 2) Configure env vars and run your application
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py   # all OpenAI, Anthropic, Google Gemini, LiteLLM calls tracked`;

  const nodeHookCode = `# 1) Generate workspace environment file (.env.aurex)
npx aurex install-hook

# 2) Source settings, configure key and run your app
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js    # all OpenAI, Anthropic, LiteLLM calls tracked`;

  const pythonManualCode = `from aurex_sdk import AurexAuditor, AurexConfig

# Initialize singleton with configuration
auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="my-project",
    storage_mode="file",                  # "file" or "memory"
    ledger_path=".aurex/ledger.jsonl",
    cloud_sync=True                       # Enable backend sync
))

# Log manual event (or see patch_all below)
auditor.log_event(
    model="gpt-4o-mini",
    input_tokens=120,
    output_tokens=40,
    workflow_id="checkout_agent"
)

# Force-flush pending sync queue
auditor.flush()

# Cleanup background sync thread on exit
auditor.shutdown()`;

  const nodeManualCode = `import { AurexAuditor } from "aurex-sdk";

// Initialize singleton with configuration
const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "my-project",
  ledgerPath: ".aurex/ledger.jsonl",
  cloudSync: true                         // Enable backend sync
});

// Log manual event (or see patchAll below)
auditor.logEvent({
  model: "gpt-4o-mini",
  inputTokens: 120,
  outputTokens: 40,
  workflowId: "checkout_agent"
});

// Force-flush pending sync queue
auditor.flush();

// Cleanup sync resources on shutdown
process.on("SIGINT", () => {
  auditor.shutdown();
  process.exit(0);
});`;

  const pythonPatchCode = `from aurex_sdk import AurexAuditor

auditor = AurexAuditor()

# Patch all supported providers at once
auditor.patch_all()

# Or selectively patch individual clients
# auditor.patch_openai()
# auditor.patch_anthropic()
# auditor.patch_google()  # Google Gemini support (Python Only)
# auditor.patch_litellm()
# auditor.patch_huggingface()  # Hugging Face support`;

  const nodePatchCode = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

// Patch all supported clients at once
auditor.patchAll();

// Or selectively patch individual clients
// auditor.patchOpenAI();
// auditor.patchAnthropic();
// auditor.patchLiteLLM();
// auditor.patchHuggingFace();  // Hugging Face support`;

  const pythonPricingCode = `# Configure pricing via custom JSON file or fallback
auditor = AurexAuditor(AurexConfig(
    pricing_path="path/to/custom_pricing.json",
    default_pricing={"input": 0.15, "output": 0.60}  # Fallback for unknown models
))

# Programmatic pricing registration (supports wildcard matchers like "local/*")
auditor.register_model_pricing("custom-llama-3", input_cost=0.15, output_cost=0.60)
auditor.register_model_pricing("local/*", input_cost=0.00, output_cost=0.00)`;

  const nodePricingCode = `// Configure pricing via custom JSON file or fallback
const auditor = AurexAuditor.getInstance({
  pricingPath: "path/to/custom_pricing.json",
  defaultPricing: { input: 0.15, output: 0.60 }  // Fallback for unknown models
});

// Programmatic pricing registration (supports wildcard matchers like "local/*")
auditor.registerModelPricing("custom-llama-3", 0.15, 0.60);
auditor.registerModelPricing("local/*", 0.00, 0.00);`;

  const pythonWrapCode = `import openai
from aurex_sdk import AurexAuditor

auditor = AurexAuditor()
auditor.patch_all()

# Wrap calls to intercept and apply request-scoped options & budgets
res = auditor.wrap(
    call_fn=openai.chat.completions.create,
    build_params=lambda: {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Process request details"}]
    },
    options={
        "workflow_id": "tenant_abc_session",
        "tags": {"tier": "enterprise"},
        "simple_prompt_token_limit": 50,  # override default simple limit
        "budget_guard": {
            "max_cost_per_session": 0.05,  # custom budget for this tenant
            "on_budget_exceeded": "throw"
        },
        "downgrade_map": {
            "gpt-4o": "gpt-4o-mini"  # model swap downgrade target
        }
    }
)`;

  const nodeWrapCode = `import OpenAI from "openai";
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
const openai = new OpenAI();

// Wrap calls to intercept and apply request-scoped options & budgets (via AsyncLocalStorage)
const response = await auditor.wrap(
  async (params) => openai.chat.completions.create(params),
  () => ({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Process request details" }]
  }),
  {
    workflowId: "tenant_abc_session",
    tags: { tier: "enterprise" },
    simplePromptTokenLimit: 50,  // override default simple limit
    budgetGuard: {
      maxCostPerSession: 0.05,   // custom budget for this tenant
      onBudgetExceeded: "throw"
    },
    downgradeMap: {
      "gpt-4o": "gpt-4o-mini"    // model swap downgrade target
    }
  }
);`;

  const pythonOutcomesCode = `from aurex_sdk import AurexAuditor

auditor = AurexAuditor()

# Call once per workflow completion to record outcomes
auditor.mark_success("checkout_agent", {"ticket_id": "T-123"})

# Or signal failure
auditor.mark_failure("checkout_agent", "timeout", {"retries": 3})`;

  const nodeOutcomesCode = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

// Call once per workflow completion to record outcomes
auditor.markSuccess("checkout_agent", { ticketId: "T-123" });

// Or signal failure
auditor.markFailure("checkout_agent", "timeout", { retries: 3 });`;

  const pythonGuardsCode = `from aurex_sdk import AurexAuditor, AurexDecision, AurexAction

auditor = AurexAuditor()

# Evaluate guards locally before calling LLM
decision: AurexDecision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Generate python code...",
    system_prompt="You are an AI assistant...",
    workflow_id="user_session_123",
    messages=[{"role": "user", "content": "..."}]
)

# Handle action
if decision.action == "block":
    raise Exception(f"Blocked by guard: {decision.reason}")
elif decision.action == "downgrade":
    # Swap to cheaper model suggestion
    model = decision.suggested_model  # e.g., "gpt-4o-mini"
elif decision.action == "compress":
    # Pruned system prompts
    messages = decision.compressed_messages

# Ignore specific workflows
auditor.ignore("admin_workflow_456")`;

  const nodeGuardsCode = `import { AurexAuditor, AurexDecision } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

// Evaluate guards locally before calling LLM
const decision: AurexDecision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Generate python code...",
  systemPrompt: "You are an AI assistant...",
  workflowId: "user_session_123",
  messages: [{ role: "user", content: "..." }]
});

// Handle action
if (decision.action === "block") {
  throw new Error(\`Blocked by guard: \${decision.reason}\`);
} else if (decision.action === "downgrade") {
  // Swap to cheaper model suggestion
  const model = decision.suggestedModel;  // e.g., "gpt-4o-mini"
} else if (decision.action === "compress") {
  // Pruned system prompts
  const messages = decision.compressedMessages;
}

// Ignore specific workflows
auditor.ignore("admin_workflow_456");`;

  const pythonHealthCode = `from aurex_sdk import AurexAuditor

auditor = AurexAuditor()

# Get telemetry sync thread health status
health = auditor.get_health()
print(health)
# Output:
# {
#   "status": "healthy",
#   "queue_size": 0,
#   "pending_file_exists": False,
#   "thread_active": True,
#   "events_logged": 42
# }`;

  const nodeHealthCode = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

// Get telemetry sync status
const health = auditor.getHealth();
console.log(health);
// Output:
// {
//   status: "healthy",
//   queueSize: 0,
//   threadActive: true,
//   eventsLogged: 12
// }`;

  const pythonCliCode = `# Heuristics analysis on local ledger
aurex audit --ledger .aurex/ledger.jsonl

# Fail build if score is under 85 or waste exceeds $5
aurex audit --fail-under 85 --max-waste-usd 5.00 --mode block`;

  const nodeCliCode = `# CI heuristics analysis on local ledger
npx aurex ci

# Fail CI if critical waste is found
npx aurex ci --mode=block --github-comment`;

  return (
    <div className="space-y-20">
      <div>
        <h1 className="text-3xl font-display font-bold text-white">API Reference</h1>
        <p className="text-white/50 mt-2">
          Configuration options, guards, provider matrix, health monitoring, and CLI tools.
        </p>
      </div>
            {/* Overview */}
            <section id="overview" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                Overview
              </h2>
              <div className="text-white/60 space-y-4 leading-relaxed">
                <p>
                  Aurex watches your LLM calls. It registers telemetry locally to a disk file (<code className="text-indigo-400">.aurex/ledger.jsonl</code>
                  ) and optionally streams <strong className="text-white/80">metadata-only telemetry</strong> asynchronously to the backend dashboard. 
                  This metadata includes input/output token counts, cached status, cost calculations, and prompt hashes. Prompts/responses themselves are hashed locally and are never synced to the cloud unless explicitly opted in.
                </p>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-sm text-white/50">
                  <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white font-medium block">Complete Feature Parity</strong>
                    Both the Python and Node.js SDKs support the full feature matrix including auto-patchers, outcomes tracking, CLI tools, and real-time budget guard checks (which evaluate locally in-process without network overhead).
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: "Local First Control Plane", desc: "Disk-backed ledger buffering. Real-time budget breakers evaluate offline to prevent blocking network calls.", icon: ShieldCheck },
                  { title: "Project Scoped Keys", desc: "Initialize with aux_live_* tokens to organize telemetry logs by team workspace and projects.", icon: Target },
                  { title: "Zero Latency Guards", desc: "Intercept calls, compress system messages, and swap to cheap models instantly in-process.", icon: Zap },
                ].map((item, idx) => (
                  <div key={idx} className="p-5 rounded-xl border border-white/[0.05] bg-white/[0.01]">
                    <item.icon className="w-5 h-5 text-emerald-400 mb-2" />
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="text-xs text-white/40 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick Start */}
            <section id="quickstart" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Quick Start & Installation
              </h2>
              <p className="text-white/60 text-sm">
                Add Aurex to your project dependencies:
              </p>
              <DualCodeBlock
                pythonCode={pythonInstallCode}
                nodeCode={nodeInstallCode}
                pythonId="copy-py-install"
                nodeId="copy-node-install"
                pythonTitle="Python Installation"
                nodeTitle="Node.js Installation"
              />

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-3 text-sm text-white/50">
                <h4 className="text-white font-semibold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Common SDK Environment Variables
                </h4>
                <ul className="space-y-2.5 font-mono text-xs">
                  <li>
                    <strong className="text-white/70 block mb-0.5">AUREX_API_KEY</strong> 
                    <span className="text-white/45 font-sans">Your project API key (e.g. <code>aux_live_...</code> generated in the <a href="/app/api-keys" className="text-emerald-400 hover:underline">API keys dashboard</a>).</span>
                  </li>
                  <li>
                    <strong className="text-white/70 block mb-0.5">AUREX_BASE_URL</strong> 
                    <span className="text-white/45 font-sans">Specifies the endpoint base for backend syncing. Default: <code>http://localhost:8000/api/v1</code>.</span>
                  </li>
                  <li>
                    <strong className="text-white/70 block mb-0.5">AUREX_WORKFLOW_ID</strong> 
                    <span className="text-white/45 font-sans">Attribute LLM spend and success rates to logical operations (e.g. <code>checkout_flow</code>).</span>
                  </li>
                  <li>
                    <strong className="text-white/70 block mb-0.5">AUREX_ENABLED</strong> 
                    <span className="text-white/45 font-sans">Set to <code>0</code> or <code>false</code> to quickly disable all Aurex interceptors. Default: <code>1</code>.</span>
                  </li>
                  <li>
                    <strong className="text-white/70 block mb-0.5">AUREX_SYNC_PROMPT_HASHES</strong> 
                    <span className="text-white/45 font-sans">Set to <code>1</code> to hash and send prompt structures. Defaults to <code>0</code> for maximum privacy.</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Zero-Code Auto-Hook */}
            <section id="autohook" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Zero-Code Auto-Hook
              </h2>
              <p className="text-white/60 leading-relaxed text-sm">
                No code modification needed. Aurex injects an import hook at the runtime level to automatically wrap standard LLM packages (such as <code>openai</code>, <code>anthropic</code>, and <code>litellm</code>).
              </p>
              
              <DualCodeBlock
                pythonCode={pythonHookCode}
                nodeCode={nodeHookCode}
                pythonId="copy-py-hook"
                nodeId="copy-node-hook"
                pythonTitle="Python CLI Hook"
                nodeTitle="Node.js CLI Hook"
              />

              <p className="text-xs text-white/40 italic">
                To deactivate the hook run <code className="text-indigo-400">aurex uninstall-hook</code> (Python) or <code className="text-indigo-400">npx aurex uninstall-hook</code> (Node.js).
              </p>
            </section>

            {/* Manual Integration */}
            <section id="integration" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-rose-400" />
                Manual Integration
              </h2>
              <p className="text-white/60 text-sm">
                Initialize the SDK manually in your code and patch your LLM clients:
              </p>

              <DualCodeBlock
                pythonCode={pythonManualCode}
                nodeCode={nodeManualCode}
                pythonId="copy-py-manual"
                nodeId="copy-node-manual"
                pythonTitle="Python Manual Start"
                nodeTitle="Node.js Manual Start"
              />

              <h3 className="text-lg font-semibold text-white mt-8">Automatic Client Patching</h3>
              <p className="text-white/60 text-sm">
                Call the patch method to hook directly into import wrappers:
              </p>

              <DualCodeBlock
                pythonCode={pythonPatchCode}
                nodeCode={nodePatchCode}
                pythonId="copy-py-patch"
                nodeId="copy-node-patch"
                pythonTitle="Python Auto-Patcher"
                nodeTitle="Node.js Auto-Patcher"
              />

              <h3 className="text-lg font-semibold text-white mt-8">Dynamic Pricing & Custom Costs</h3>
              <p className="text-white/60 text-sm">
                Aurex supports custom JSON pricing files loaded via configuration or environment variables, wildcard matchers (like <code className="text-indigo-400">custom/*</code>), and programmatic model pricing registration:
              </p>

              <DualCodeBlock
                pythonCode={pythonPricingCode}
                nodeCode={nodePricingCode}
                pythonId="copy-py-pricing"
                nodeId="copy-node-pricing"
                pythonTitle="Python Pricing Registry"
                nodeTitle="Node.js Pricing Registry"
              />
            </section>

            {/* AurexConfig Options Reference */}
            <section id="config-reference" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                AurexConfig Reference Parameters
              </h2>
              <p className="text-white/60 text-sm">
                Configure your auditor singleton using these options:
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-sm text-white/60 text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-white">
                      <th className="p-3 text-sm font-semibold">Python Config</th>
                      <th className="p-3 text-sm font-semibold">Node.js Config</th>
                      <th className="p-3 text-sm font-semibold">Default</th>
                      <th className="p-3 text-sm font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
                    <tr>
                      <td className="p-3 text-indigo-400">api_key</td>
                      <td className="p-3 text-indigo-400">apiKey</td>
                      <td className="p-3">None</td>
                      <td className="p-3 font-sans">Aurex project key. Enables cloud sync.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">project</td>
                      <td className="p-3 text-indigo-400">project</td>
                      <td className="p-3">"default"</td>
                      <td className="p-3 font-sans">Group telemetry under a workspace code.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">ledger_path</td>
                      <td className="p-3 text-indigo-400">ledgerPath</td>
                      <td className="p-3">".aurex/ledger.jsonl"</td>
                      <td className="p-3 font-sans">Local JSONL ledger location.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">cloud_sync</td>
                      <td className="p-3 text-indigo-400">cloudSync</td>
                      <td className="p-3">False</td>
                      <td className="p-3 font-sans">Toggle background upload of event logs.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">base_url</td>
                      <td className="p-3 text-indigo-400">baseUrl</td>
                      <td className="p-3">http://localhost:8000/api/v1</td>
                      <td className="p-3 font-sans">Target REST backend base endpoint.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">flush_interval_seconds</td>
                      <td className="p-3 text-indigo-400">flushIntervalMs</td>
                      <td className="p-3">30.0s / 30000ms</td>
                      <td className="p-3 font-sans">Interval for bulk ledger transmissions.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">max_batch_size</td>
                      <td className="p-3 text-indigo-400">maxBatchSize</td>
                      <td className="p-3">100</td>
                      <td className="p-3 font-sans">Maximum number of events per upload request.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">storage_mode</td>
                      <td className="p-3 text-indigo-400">N/A</td>
                      <td className="p-3">"file"</td>
                      <td className="p-3 font-sans">Write ledger: <code>"file"</code> (disk) or <code>"memory"</code> (RAM). (Python only)</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">sync_prompt_hashes</td>
                      <td className="p-3 text-indigo-400">syncPromptHashes</td>
                      <td className="p-3">False</td>
                      <td className="p-3 font-sans">Send SHA-256 signatures of prompts to dashboard.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">pricing_path</td>
                      <td className="p-3 text-indigo-400">pricingPath</td>
                      <td className="p-3">None</td>
                      <td className="p-3 font-sans">Path to custom JSON pricing configuration file.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">default_pricing</td>
                      <td className="p-3 text-indigo-400">defaultPricing</td>
                      <td className="p-3">None</td>
                      <td className="p-3 font-sans">Fallback pricing dictionary with input/output costs per 1M tokens.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">simple_prompt_token_limit</td>
                      <td className="p-3 text-indigo-400">simplePromptTokenLimit</td>
                      <td className="p-3">120</td>
                      <td className="p-3 font-sans">Threshold token count below which prompts are classified as simple.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">runaway_context_multiplier</td>
                      <td className="p-3 text-indigo-400">runawayContextMultiplier</td>
                      <td className="p-3">2.2</td>
                      <td className="p-3 font-sans">Scaling factor indicating context runaway checks.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">loop_similarity_threshold</td>
                      <td className="p-3 text-indigo-400">loopSimilarityThreshold</td>
                      <td className="p-3">0.8</td>
                      <td className="p-3 font-sans">Jaccard similarity index limit for loop checking.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">downgrade_map</td>
                      <td className="p-3 text-indigo-400">downgradeMap</td>
                      <td className="p-3">None</td>
                      <td className="p-3 font-sans">Custom map defining cheaper alternatives for models (e.g. gpt-4o &rarr; gpt-4o-mini).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* BudgetGuard Setup */}
            <section id="budget-guard-config" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                BudgetGuard Setup
              </h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Prevent rogue agent cascades and overspending. Passing <code>budget_guard</code> enforces client-side circuit breakers.
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-sm text-white/60 text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-white">
                      <th className="p-3 text-sm font-semibold">Python Guard Key</th>
                      <th className="p-3 text-sm font-semibold">Node.js Guard Key</th>
                      <th className="p-3 text-sm font-semibold">Type</th>
                      <th className="p-3 text-sm font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
                    <tr>
                      <td className="p-3 text-indigo-400">max_cost_per_minute</td>
                      <td className="p-3 text-indigo-400">maxCostPerMinute</td>
                      <td className="p-3">float</td>
                      <td className="p-3 font-sans">Max allowed LLM spend in USD per rolling 60s.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">max_cost_per_session</td>
                      <td className="p-3 text-indigo-400">maxCostPerSession</td>
                      <td className="p-3">float</td>
                      <td className="p-3 font-sans">Max allowed LLM spend in USD for a single workflow/session.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">max_requests_per_minute</td>
                      <td className="p-3 text-indigo-400">maxRequestsPerMinute</td>
                      <td className="p-3">integer</td>
                      <td className="p-3 font-sans">Rate limit of LLM request events per rolling 60s.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">max_context_tokens</td>
                      <td className="p-3 text-indigo-400">maxContextTokens</td>
                      <td className="p-3">integer</td>
                      <td className="p-3 font-sans">Maximum token context allowed for a single API check.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">on_budget_exceeded</td>
                      <td className="p-3 text-indigo-400">onBudgetExceeded</td>
                      <td className="p-3">string</td>
                      <td className="p-3 font-sans">Action when limit hit: <code>"throw"</code> (crash call), <code>"warn"</code>, or <code>"webhook"</code>.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">webhook_url</td>
                      <td className="p-3 text-indigo-400">webhookUrl</td>
                      <td className="p-3">string</td>
                      <td className="p-3 font-sans">Destination URL for payload sync if webhook option is configured.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">dry_run</td>
                      <td className="p-3 text-indigo-400">dryRun</td>
                      <td className="p-3">boolean</td>
                      <td className="p-3 font-sans">Evaluate guards and track metrics without blocking/throwing.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Supported Providers Matrix */}
            <section id="provider-matrix" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                Supported Providers Matrix
              </h2>
              <p className="text-white/60 text-sm">
                Features automatically intercepted and supported by SDK auto-patching:
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-sm text-white/60 text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-white">
                      <th className="p-3 text-sm font-semibold">LLM Provider</th>
                      <th className="p-3 text-sm font-semibold">Python SDK</th>
                      <th className="p-3 text-sm font-semibold">Node.js SDK</th>
                      <th className="p-3 text-sm font-semibold">Telemetry Hook Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-xs font-mono">
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">OpenAI (v1.0+)</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 font-sans text-white/50">Full auto-wrap including reasoning tokens and caches.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">Anthropic (v0.18+)</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 font-sans text-white/50">Wraps system prompt inputs and token counts.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">Google Gemini</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 text-rose-500 font-bold">❌ No</td>
                      <td className="p-3 font-sans text-white/50">Patches <code>google-genai</code> and legacy <code>google-generativeai</code> SDKs. (Python Only)</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">LiteLLM / Portkey</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 font-sans text-white/50">Patches multi-provider routing frameworks.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">Ollama / Custom</td>
                      <td className="p-3 text-amber-400 font-bold">⚠️ Partial</td>
                      <td className="p-3 text-amber-400 font-bold">⚠️ Partial</td>
                      <td className="p-3 font-sans text-white/50">Trackable via LiteLLM or OpenAI endpoint proxy configuration.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white font-sans font-medium">Hugging Face</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 text-emerald-400 font-bold">✅ Yes</td>
                      <td className="p-3 font-sans text-white/50">Patches <code>huggingface_hub</code> (Python) and <code>@huggingface/inference</code> (Node.js). Serverless cost: $0.00.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Real-Time Guards */}
            <section id="guards" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Real-Time Guards & Decision Engine
              </h2>
              <p className="text-white/60 leading-relaxed text-sm">
                Evaluate calls against cost efficiency and runaway policies locally in-process without network overhead. The pre-call checker evaluates n-gram similarity, cost ceilings, and token volumes, returning an <code>AurexDecision</code>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  { action: "proceed", desc: "No violation detected. Let the API call pass through normally." },
                  { action: "downgrade", desc: "Auto-replace model with cheaper option (e.g. claude-3-opus -> claude-3-haiku)." },
                  { action: "compress", desc: "Filter duplicate system prompts from context to save input token costs." },
                  { action: "block", desc: "Violates budget thresholds. Halts execution or logs an override alert." },
                ].map((row) => (
                  <div key={row.action} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.01]">
                    <code className="text-emerald-400 font-mono">{row.action}</code>
                    <p className="text-white/45 text-xs mt-1 leading-relaxed">{row.desc}</p>
                  </div>
                ))}
              </div>

              <DualCodeBlock
                pythonCode={pythonGuardsCode}
                nodeCode={nodeGuardsCode}
                pythonId="copy-py-guards"
                nodeId="copy-node-guards"
                pythonTitle="Python pre_call_check"
                nodeTitle="Node.js preCallCheck"
              />
            </section>

            {/* Context Overrides & Wrappers */}
            <section id="context-wrappers" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                Context Overrides & Wrappers
              </h2>
              <p className="text-white/60 leading-relaxed text-sm">
                Aurex is built for multi-tenant applications. Using thread-local variables (<code className="text-indigo-400">contextvars</code> in Python) and async-local variables (<code className="text-indigo-400">AsyncLocalStorage</code> in Node.js), developers can override configuration options, budget guardrails, and metadata dynamically per execution context without altering global singleton states.
              </p>

              <DualCodeBlock
                pythonCode={pythonWrapCode}
                nodeCode={nodeWrapCode}
                pythonId="copy-py-wrap"
                nodeId="copy-node-wrap"
                pythonTitle="Python wrap() Context Options"
                nodeTitle="Node.js wrap() Context Options"
              />
            </section>

            {/* Success & Failure Signals */}
            <section id="outcomes" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Success & Failure Signals
              </h2>
              <p className="text-white/60 leading-relaxed text-sm">
                LLM tokens alone don't reveal task outcomes. Register successful or failed operations once logical workflows finish to feed cost-efficiency calculations on the analytics dashboard.
              </p>
              
              <DualCodeBlock
                pythonCode={pythonOutcomesCode}
                nodeCode={nodeOutcomesCode}
                pythonId="copy-py-outcomes"
                nodeId="copy-node-outcomes"
                pythonTitle="Python Outcomes Logging"
                nodeTitle="Node.js Outcomes Logging"
              />
            </section>

            {/* Health & Crash Recovery */}
            <section id="health-monitoring" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-400" />
                Health & Crash Recovery
              </h2>
              <p className="text-white/60 text-sm leading-relaxed">
                The Aurex daemon maintains crash durability. If a system shutdown occurs mid-run, telemetry is buffered locally to <code>pending.jsonl</code>. On start, the auditor flushes this backup file to prevent data loss.
              </p>

              <DualCodeBlock
                pythonCode={pythonHealthCode}
                nodeCode={nodeHealthCode}
                pythonId="copy-py-health"
                nodeId="copy-node-health"
                pythonTitle="Python Health Checker"
                nodeTitle="Node.js Health Checker"
              />
            </section>

            {/* Offline Heuristics CLI */}
            <section id="heuristics" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                Offline Heuristics CLI
              </h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Scan your local ledger files (<code>ledger.jsonl</code>) offline to detect loops, context spikes, or waste drivers without launching a database:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {[
                  "System prompt duplication alerts",
                  "Agent runaway looping heuristics",
                  "Over-provisioned expensive model misuse",
                  "Excessive context expansion ratios (3.5x+)",
                  "Semantic loop repeating detection",
                  "Client retry cascade analytics",
                ].map((title) => (
                  <div key={title} className="p-3 rounded-lg border border-white/[0.06] text-white/50 font-sans">
                    {title}
                  </div>
                ))}
              </div>

              <DualCodeBlock
                pythonCode={pythonCliCode}
                nodeCode={nodeCliCode}
                pythonId="copy-py-cli"
                nodeId="copy-node-cli"
                pythonTitle="Python Heuristics CLI"
                nodeTitle="Node.js Heuristics CLI"
              />
            </section>

            {/* CI Policy Gate */}
            <section id="cicd" className="scroll-mt-32 space-y-6">
              <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
                CI Policy Gate & Build Breaker
              </h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Fail commits or PR builds automatically when cost thresholds or Token Credit Scores fall below threshold values. 
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <table className="w-full text-sm text-white/60 text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-white">
                      <th className="p-3 text-sm font-semibold">CI Flag</th>
                      <th className="p-3 text-sm font-semibold">Mode Option</th>
                      <th className="p-3 text-sm font-semibold">CI Behavior</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono text-xs">
                    <tr>
                      <td className="p-3 text-indigo-400">--mode warn</td>
                      <td className="p-3">warn (Default)</td>
                      <td className="p-3 font-sans text-white/50">Prints comprehensive Markdown efficiency report; exits with code 0.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">--mode block</td>
                      <td className="p-3">block</td>
                      <td className="p-3 font-sans text-white/50">Halts pipeline execution with exit code 1 if policies are violated.</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-400">--github-comment</td>
                      <td className="p-3">—</td>
                      <td className="p-3 font-sans text-white/50">Outputs structured Markdown layout suitable for posting as PR summary comments.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
    </div>
  );
}
