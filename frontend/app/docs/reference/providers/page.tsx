import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Supported Providers — Aurex SDK",
  description: "LLM provider auto-patch coverage for Python and Node.js SDKs.",
};

export default function DocsProvidersPage() {
  return (
    <DocPageShell
      title="Supported Providers"
      description="Features intercepted by SDK auto-patching and install-hook."
      agentHint="Use when choosing patch_openai vs patch_litellm or checking Google Gemini Python-only support."
      scopeIn={["Provider patch matrix", "patch_* method names"]}
      scopeOut={["Manual log_event — see Manual Integration", "Resilience fallbacks — customer-owned clients"]}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <table className="w-full text-sm text-white/60 text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-white">
              <th className="p-3 font-semibold">Provider</th>
              <th className="p-3 font-semibold">Python</th>
              <th className="p-3 font-semibold">Node.js</th>
              <th className="p-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-xs">
            <tr>
              <td className="p-3 text-white font-medium">OpenAI (v1+)</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 font-sans text-white/50">Reasoning tokens and cache metadata.</td>
            </tr>
            <tr>
              <td className="p-3 text-white font-medium">Anthropic (v0.18+)</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 font-sans text-white/50">System prompt and token counts.</td>
            </tr>
            <tr>
              <td className="p-3 text-white font-medium">Google Gemini</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 text-rose-400">No</td>
              <td className="p-3 font-sans text-white/50">google-genai / google-generativeai (Python).</td>
            </tr>
            <tr>
              <td className="p-3 text-white font-medium">LiteLLM / Portkey</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 font-sans text-white/50">Multi-provider routing.</td>
            </tr>
            <tr>
              <td className="p-3 text-white font-medium">Hugging Face</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 text-emerald-400">Yes</td>
              <td className="p-3 font-sans text-white/50">huggingface_hub / @huggingface/inference.</td>
            </tr>
            <tr>
              <td className="p-3 text-white font-medium">Ollama / custom</td>
              <td className="p-3 text-amber-400">Partial</td>
              <td className="p-3 text-amber-400">Partial</td>
              <td className="p-3 font-sans text-white/50">Via LiteLLM or OpenAI-compatible proxy.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocSeeAlso
        links={[
          { href: "/docs/reference/autohook", label: "Auto-Hook" },
          { href: "/docs/reference/integration", label: "Manual Integration" },
          { href: "/docs/harness/decision-matrix", label: "Harness Matrix" },
        ]}
      />
    </DocPageShell>
  );
}
