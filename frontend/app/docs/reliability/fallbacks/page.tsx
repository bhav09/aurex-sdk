import { DualCodeBlock } from "@/components/docs/dual-code-block";
import { DocPageShell } from "@/components/docs/doc-page-shell";
import { DocSeeAlso } from "@/components/docs/doc-see-also";

export const metadata = {
  title: "Resilience Fallbacks — Aurex SDK",
  description: "register_fallback and registerFallback for customer-owned provider clients.",
};

const pythonFallback = `import openai
from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    resilience={
        "enabled": True,
        "mode": "enforce",
        "fallbacks": [{"name": "openai_mini", "after": ["network", "5xx"]}],
    },
))

client = openai.OpenAI()

def call_mini(**kwargs):
    kwargs["model"] = "gpt-4o-mini"
    return client.chat.completions.create(**kwargs)

auditor.register_fallback(
    "openai_mini",
    call_fn=call_mini,
    provider="openai",
    model="gpt-4o-mini",
)`;

const nodeFallback = `import OpenAI from "openai";
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  resilience: {
    enabled: true,
    mode: "enforce",
    fallbacks: [{ name: "openai_mini", after: ["network", "5xx"] }],
  },
});

const client = new OpenAI();

auditor.registerFallback("openai_mini", async (params) => {
  return client.chat.completions.create({ ...params, model: "gpt-4o-mini" });
}, { provider: "openai", model: "gpt-4o-mini" });`;

export default function DocsFallbacksPage() {
  return (
    <DocPageShell
      title="Fallbacks"
      description="Register named callables that invoke your own provider clients and API keys. Aurex does not proxy LLM traffic."
      agentHint="Use for register_fallback / registerFallback, fallbacks config chain, idempotency modes."
      scopeIn={["register_fallback API", "fallbacks config name/after", "idempotency auto | require_key | off"]}
      scopeOut={["Classification kinds — see Classification", "Dashboard metrics — see Loss Accounting"]}
    >
      <DualCodeBlock
        pythonCode={pythonFallback}
        nodeCode={nodeFallback}
        pythonId="fallback-py"
        nodeId="fallback-node"
      />

      <ul className="space-y-2 text-sm text-white/50 list-disc list-inside">
        <li>
          <code className="text-teal-400">idempotency: require_key</code> — skips retry/fallback without a stable
          idempotency key (safe for non-idempotent tools).
        </li>
        <li>
          Retries and fallbacks accumulate cost against <code>max_extra_cost_usd</code>; enforce stops when exceeded.
        </li>
        <li>Fallback callables receive the same params built for the primary call.</li>
      </ul>

      <DocSeeAlso
        links={[
          { href: "/docs/reliability/observe-enforce", label: "Observe vs Enforce" },
          { href: "/docs/reliability/classification", label: "Classification" },
          { href: "/docs/harness/decision-matrix", label: "Harness Matrix" },
        ]}
      />
    </DocPageShell>
  );
}
