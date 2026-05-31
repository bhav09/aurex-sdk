import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Zero-Code Auto-Hook — Aurex SDK",
  description: "Install Aurex runtime hooks for OpenAI, Anthropic, LiteLLM, and more without code changes.",
};

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

export default function DocsAutohookPage() {
  return (
    <DocPageShell
      title="Zero-Code Auto-Hook"
      description="Inject Aurex at import time so standard LLM client libraries are tracked without modifying call sites."
      agentHint="Use this page when the user wants install-hook, AUREX_ENABLED, or zero-code provider tracking."
      scopeIn={["aurex install-hook / npx aurex install-hook", "AUREX_ENABLED activation", "Uninstall commands"]}
      scopeOut={["Manual singleton setup — see Manual Integration", "Provider matrix details — see Supported Providers"]}
    >
      <DualCodeBlock
        pythonCode={pythonHookCode}
        nodeCode={nodeHookCode}
        pythonId="copy-py-hook"
        nodeId="copy-node-hook"
        pythonTitle="Python CLI Hook"
        nodeTitle="Node.js CLI Hook"
      />

      <p className="text-xs text-white/40 italic">
        To deactivate run <code className="text-indigo-400">aurex uninstall-hook</code> (Python) or{" "}
        <code className="text-indigo-400">npx aurex uninstall-hook</code> (Node.js).
      </p>

      <DocSeeAlso
        links={[
          { href: "/docs/installation", label: "Installation" },
          { href: "/docs/reference/providers", label: "Supported Providers" },
          { href: "/docs/reference/integration", label: "Manual Integration" },
        ]}
      />
    </DocPageShell>
  );
}
