import { describe, expect, it } from "vitest";
import {
  classifyResponse,
  classifyException,
  estimateProjectedRerouteCost,
  executeWithResilience,
  parseResilienceConfig,
} from "../../../sdk/node/src/resilience";
import { AurexResilienceExhausted } from "../../../sdk/node/src/exceptions";

describe("resilience", () => {
  it("classifies success", () => {
    const r = classifyResponse("openai", {
      choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
    });
    expect(r.usable).toBe(true);
  });

  it("classifies empty soft failure", () => {
    const r = classifyResponse("openai", {
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
    });
    expect(r.usable).toBe(false);
    expect(r.kind).toBe("empty");
  });

  it("classifies timeout exception", () => {
    const r = classifyException(new Error("request timed out"));
    expect(r.kind).toBe("timeout");
  });

  it("observe mode does not retry", async () => {
    let calls = 0;
    await expect(
      executeWithResilience(
        () => {
          calls += 1;
          throw new Error("network reset");
        },
        parseResilienceConfig({ enabled: true, mode: "observe", max_attempts: 2 }),
        {
          provider: "openai",
          model: "gpt-4o",
          workflowId: "wf",
          onAttempt: () => {},
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("enforce mode recovers on second attempt", async () => {
    let calls = 0;
    const { resp } = await executeWithResilience(
      () => {
        calls += 1;
        if (calls === 1) throw new Error("network reset");
        return { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] };
      },
      parseResilienceConfig({
        enabled: true,
        mode: "enforce",
        max_attempts: 2,
        retry_on: ["network"],
        backoff: { base_ms: 1, max_ms: 2, jitter: 0 },
      }),
      {
        provider: "openai",
        model: "gpt-4o",
        workflowId: "wf",
        idempotencyKey: "k1",
        onAttempt: () => {},
      },
    );
    expect(calls).toBe(2);
    expect(resp.choices[0].message.content).toBe("ok");
  });

  it("projected reroute cost", () => {
    const c = estimateProjectedRerouteCost("gpt-4o", "gpt-4o-mini", 1000, 100, 0.01, () => 0.02);
    expect(c).toBeCloseTo(0.03);
  });

  it("throws when exhausted in enforce mode", async () => {
    await expect(
      executeWithResilience(
        () => {
          throw new Error("network reset");
        },
        parseResilienceConfig({ enabled: true, mode: "enforce", max_attempts: 1 }),
        {
          provider: "openai",
          model: "gpt-4o",
          workflowId: "wf",
          onAttempt: () => {},
        },
      ),
    ).rejects.toBeInstanceOf(AurexResilienceExhausted);
  });
});
