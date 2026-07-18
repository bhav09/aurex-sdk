import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Integration - Aurex SDK",
  description: "Initialize the Aurex singleton, patch LLM clients, and manage the runtime lifecycle.",
};

const pythonManualCode = `from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="my-project",
    storage_mode="file",
    ledger_path=".aurex/ledger.jsonl",
    cloud_sync=True,
))

auditor.log_event(
    model="gpt-4o-mini",
    input_tokens=120,
    output_tokens=40,
    workflow_id="checkout_agent",
)

auditor.flush()
auditor.shutdown()`;

const nodeManualCode = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "my-project",
  ledgerPath: ".aurex/ledger.jsonl",
  cloudSync: true,
});

auditor.logEvent({
  model: "gpt-4o-mini",
  inputTokens: 120,
  outputTokens: 40,
  workflowId: "checkout_agent",
});

await auditor.flushAndWait();
auditor.shutdown();`;

const pythonPatchCode = `from aurex_sdk import AurexAuditor

auditor = AurexAuditor()
auditor.patch_all()
# auditor.patch_openai()
# auditor.patch_anthropic()`;

const nodePatchCode = `import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
auditor.patchAll();`;

const pythonPricingCode = `auditor.register_model_pricing("custom-llama-3", input_cost=0.15, output_cost=0.60)
auditor.register_model_pricing("local/*", input_cost=0.00, output_cost=0.00)`;

const nodePricingCode = `auditor.registerModelPricing("custom-llama-3", 0.15, 0.60);
auditor.registerModelPricing("local/*", 0.00, 0.00);`;

export default function DocsIntegrationPage() {
  return (
    <DocPageShell
      title="Manual Integration"
      description="Initialize the auditor singleton, patch clients or log events manually, and flush before shutdown."
      agentHint="Use when wiring AurexAuditor.getInstance / AurexAuditor(), patchAll, logEvent, flush, or shutdown."
      scopeIn={["Singleton initialization", "patch_all / patchOpenAI", "Manual log_event", "Pricing registration", "flush / flushAndWait"]}
      scopeOut={["Full AurexConfig field list - see AurexConfig", "wrap() - see Context Wrappers"]}
    >
      <h2 className="text-lg font-semibold text-white">Initialize and log</h2>
      <DualCodeBlock
        pythonCode={pythonManualCode}
        nodeCode={nodeManualCode}
        pythonId="copy-py-manual"
        nodeId="copy-node-manual"
      />

      <h2 className="text-lg font-semibold text-white">Automatic client patching</h2>
      <DualCodeBlock
        pythonCode={pythonPatchCode}
        nodeCode={nodePatchCode}
        pythonId="copy-py-patch"
        nodeId="copy-node-patch"
      />

      <h2 className="text-lg font-semibold text-white">Dynamic pricing</h2>
      <DualCodeBlock
        pythonCode={pythonPricingCode}
        nodeCode={nodePricingCode}
        pythonId="copy-py-pricing"
        nodeId="copy-node-pricing"
      />

      <DocSeeAlso
        links={[
          { href: "/docs/reference/config", label: "AurexConfig" },
          { href: "/docs/reference/providers", label: "Supported Providers" },
          { href: "/docs/deployment/serverless-flush", label: "Serverless Flush" },
        ]}
      />
    </DocPageShell>
  );
}
