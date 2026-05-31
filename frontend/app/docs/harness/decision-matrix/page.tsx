import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Harness Decision Matrix — Aurex SDK",
  description: "When to use auto-hook, patch, wrap, or manual log_event.",
};

const pythonWrap = `auditor.patch_openai()  # guarded with __aurex_patched__

result = auditor.wrap(
    call_fn=openai.chat.completions.create,
    build_params=lambda: {"model": "gpt-4o", "messages": [...]},
    options={"workflow_id": "checkout_agent"},
)`;

const nodeWrap = `const response = await auditor.wrap(
  (params) => openai.chat.completions.create(params),
  () => ({ model: "gpt-4o", messages: [...] }),
  { workflowId: "checkout_agent" },
);`;

const pythonPartial = `auditor.log_event(
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

export default function DocsHarnessMatrixPage() {
  return (
    <DocPageShell
      title="Harness Decision Matrix"
      description="Choose integration depth to match your wrapper and avoid duplicate telemetry."
      agentHint="Use when user has LangChain/LiteLLM middleware or custom retry wrapper — pick one instrumentation path."
      scopeIn={["patch vs wrap vs manual log", "Double-count risk table", "Example wrap and partial patterns"]}
      scopeOut={["Full wrap API — see wrap() page", "Provider list — see Supported Providers"]}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/[0.03] text-white/60">
            <tr>
              <th className="p-3 font-medium">Your harness</th>
              <th className="p-3 font-medium">Recommended</th>
              <th className="p-3 font-medium">Double-count risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05] text-white/50">
            <tr>
              <td className="p-3 text-white/80">None — raw SDK calls</td>
              <td className="p-3">Auto-hook or patch_all()</td>
              <td className="p-3 text-emerald-400/80">Low</td>
            </tr>
            <tr>
              <td className="p-3 text-white/80">Partial — custom retry/logging wrapper</td>
              <td className="p-3">Manual log_event at wrapper boundary</td>
              <td className="p-3 text-emerald-400/80">Low if patch disabled</td>
            </tr>
            <tr>
              <td className="p-3 text-white/80">Full — LangChain/LiteLLM + OTel</td>
              <td className="p-3">wrap() with workflow_id; avoid patch + wrap</td>
              <td className="p-3 text-amber-400/80">Medium — use __aurex_patched__ guards</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold text-white">Full harness — wrap()</h2>
      <DualCodeBlock pythonCode={pythonWrap} nodeCode={nodeWrap} pythonId="wrap-py" nodeId="wrap-node" />

      <h2 className="text-lg font-semibold text-white">Partial harness — manual logging</h2>
      <DualCodeBlock pythonCode={pythonPartial} nodeCode={nodePartial} pythonId="partial-py" nodeId="partial-node" />

      <p className="text-sm text-white/50">
        Call <code className="text-indigo-400">get_health()</code> for <code>patch_status</code>. In tests, call{" "}
        <code>AurexAuditor.reset()</code> before re-configuring.
      </p>

      <DocSeeAlso
        links={[
          { href: "/docs/reference/wrap", label: "wrap() Reference" },
          { href: "/docs/reference/autohook", label: "Auto-Hook" },
          { href: "/docs/reliability/fallbacks", label: "Resilience Fallbacks" },
        ]}
      />
    </DocPageShell>
  );
}
