import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocHashRedirect } from "@/components/docs/doc-hash-redirect";
import { Terminal } from "lucide-react";

export const metadata = {
  title: "Installation — Aurex SDK",
  description: "Install and configure the Aurex Python and Node.js SDKs.",
};

const pythonInstall = `pip install aurex-sdk`;
const nodeInstall = `npm install aurex-sdk`;

const pythonHook = `# Install the hook into your site-packages
aurex install-hook

export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py`;

const nodeHook = `npx aurex install-hook
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js`;

const pythonManual = `from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="my-project",
    ledger_path=".aurex/ledger.jsonl",
    per_process_ledger=False,
    cloud_sync=True,
))
auditor.log_event(model="gpt-4o-mini", input_tokens=120, output_tokens=40)
auditor.flush()`;

const nodeManual = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "my-project",
  ledgerPath: ".aurex/ledger.jsonl",
  perProcessLedger: false,
  cloudSync: true,
});
auditor.logEvent({ model: "gpt-4o-mini", inputTokens: 120, outputTokens: 40 });
auditor.flush();`;

export default function DocsInstallationPage() {
  return (
    <div className="space-y-12">
      <DocHashRedirect />
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
          <Terminal className="w-7 h-7 text-teal-400" />
          Installation & Quick Start
        </h1>
        <p className="text-white/50 mt-2">
          Install either SDK, set your project API key, and start logging metadata-only telemetry.
        </p>
      </div>

      <section id="install" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Install</h2>
        <DualCodeBlock
          pythonCode={pythonInstall}
          nodeCode={nodeInstall}
          pythonId="install-py"
          nodeId="install-node"
        />
      </section>

      <section id="autohook" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Zero-code auto-hook</h2>
        <p className="text-white/50 text-sm">
          The install-hook command patches provider modules before your app imports them. See{" "}
          <a href="/docs/reference/autohook" className="text-teal-400">
            auto-hook reference
          </a>{" "}
          for provider coverage. Environment variables are documented on{" "}
          <a href="/docs/installation/env-vars" className="text-teal-400">
            /docs/installation/env-vars
          </a>
          .
        </p>
        <DualCodeBlock
          pythonCode={pythonHook}
          nodeCode={nodeHook}
          pythonId="hook-py"
          nodeId="hook-node"
        />
      </section>

      <section id="manual-init" className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Manual initialization</h2>
        <DualCodeBlock
          pythonCode={pythonManual}
          nodeCode={nodeManual}
          pythonId="manual-py"
          nodeId="manual-node"
        />
      </section>

      <section className="scroll-mt-32 space-y-4">
        <h2 className="text-xl font-semibold text-white">Environment variables</h2>
        <p className="text-white/50 text-sm">
          Full <code>AUREX_*</code> reference:{" "}
          <a href="/docs/installation/env-vars" className="text-teal-400">
            /docs/installation/env-vars
          </a>
        </p>
      </section>
    </div>
  );
}
