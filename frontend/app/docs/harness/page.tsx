import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { Layers } from "lucide-react";

export const metadata = {
  title: "Harness Integration — Aurex SDK",
  description: "Integrate Aurex with existing LLM wrappers, patchers, and observability stacks.",
};

const pythonWrap = `from aurex_sdk import AurexAuditor
import openai

auditor = AurexAuditor()
auditor.patch_openai()  # guarded against double-patch

result = auditor.wrap(
    call_fn=openai.chat.completions.create,
    build_params=lambda: {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
    },
    options={"workflow_id": "checkout_agent"},
)`;

const nodeWrap = `import OpenAI from "openai";
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
const openai = new OpenAI();

const response = await auditor.wrap(
  (params) => openai.chat.completions.create(params),
  () => ({ model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] }),
  { workflowId: "checkout_agent" },
);`;

const pythonPartial = `# Partial harness: you already wrap OpenAI — log manually after your interceptor
auditor.log_event(
    model=response.model,
    input_tokens=response.usage.prompt_tokens,
    output_tokens=response.usage.completion_tokens,
    workflow_id=workflow_id,
)`;

const nodePartial = `auditor.logEvent({
  model: response.model,
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
  workflowId,
});`;

export default function DocsHarnessPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Layers className="w-7 h-7 text-emerald-400" />
          Harness Integration
        </h1>
        <p className="text-white/50 mt-2">
          Pick the integration depth that matches your existing LLM wrapper or observability stack.
        </p>
      </div>

      <section id="decision-matrix" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Decision matrix</h2>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/[0.03] text-white/60">
              <tr>
                <th className="p-3 font-medium">Your harness</th>
                <th className="p-3 font-medium">Recommended approach</th>
                <th className="p-3 font-medium">Double-count risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              <tr>
                <td className="p-3 text-white/80">None — raw SDK calls</td>
                <td className="p-3 text-white/50">Auto-hook or patch_all()</td>
                <td className="p-3 text-emerald-400/80">Low</td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Partial — custom retry/logging wrapper</td>
                <td className="p-3 text-white/50">Manual log_event at wrapper boundary</td>
                <td className="p-3 text-emerald-400/80">Low if patch disabled</td>
              </tr>
              <tr>
                <td className="p-3 text-white/80">Great — LangChain/LiteLLM middleware + OTel</td>
                <td className="p-3 text-white/50">wrap() with workflow_id; avoid patch + wrap on same call</td>
                <td className="p-3 text-amber-400/80">Medium — use __aurex_patched__ guards</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="wrap" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Full harness — wrap()</h2>
        <p className="text-white/50 text-sm">
          Use when you control the call site and want request-scoped budget overrides without global module patching.
          OpenAI, Anthropic, and LiteLLM patchers include <code>__aurex_patched__</code> guards to prevent
          double instrumentation.
        </p>
        <DualCodeBlock
          pythonCode={pythonWrap}
          nodeCode={nodeWrap}
          pythonId="wrap-py"
          nodeId="wrap-node"
        />
      </section>

      <section id="partial-harness" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Partial harness — manual logging</h2>
        <p className="text-white/50 text-sm">
          If you already emit spans or tokens from an upstream middleware, disable auto-patch and call log_event once
          per completed LLM request.
        </p>
        <DualCodeBlock
          pythonCode={pythonPartial}
          nodeCode={nodePartial}
          pythonId="partial-py"
          nodeId="partial-node"
        />
      </section>

      <section id="patch-visibility" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Health & patch visibility</h2>
        <p className="text-white/50 text-sm">
          Call <code>get_health()</code> to inspect <code>patch_status</code> (which providers were patched, skipped, or
          already patched). In tests, call <code>AurexAuditor.reset()</code> before re-initializing with new config.
        </p>
      </section>
    </div>
  );
}
