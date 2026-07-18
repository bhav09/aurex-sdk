import assert from "assert";
import Module from "module";

// Mock module caching to return the exact same object on multiple requires
const mockCache: Record<string, any> = {};

// Override require to mock peer dependencies
const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function (id: string) {
  if (id === "openai" || id === "@anthropic-ai/sdk" || id === "@google/genai" || id === "ollama" || id === "@huggingface/inference") {
    if (!mockCache[id]) {
      if (id === "openai") {
        mockCache[id] = {
          OpenAI: class MockOpenAI {
            static __aurex_patched__ = false;
            chat = {
              completions: {
                create: async (params: any) => {
                  return {
                    choices: [{ 
                      message: { 
                        role: "assistant", 
                        content: "OpenAI mock response",
                        tool_calls: [{ function: { name: "openai_tool" } }]
                      } 
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 5 }
                  };
                }
              }
            };
          }
        };
      } else if (id === "@anthropic-ai/sdk") {
        mockCache[id] = {
          Anthropic: class MockAnthropic {
            static __aurex_patched__ = false;
            messages = {
              create: async (params: any) => {
                return {
                  content: [
                    { type: "text", text: "Anthropic mock response" },
                    { type: "tool_use", name: "anthropic_tool", id: "t1", input: {} }
                  ],
                  usage: { input_tokens: 8, output_tokens: 4 }
                };
              }
            };
          }
        };
      } else if (id === "@google/genai") {
        mockCache[id] = {
          GoogleGenAI: class MockGoogleGenAI {
            static __aurex_patched__ = false;
            models = {
              generateContent: async (params: any) => {
                return {
                  text: "Google mock response",
                  usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 6 }
                };
              },
              generateContentStream: async function* (params: any) {
                yield {
                  text: "Google stream mock response",
                  usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 6 }
                };
              }
            };
          }
        };
      } else if (id === "ollama") {
        mockCache[id] = {
          Ollama: class MockOllama {
            async chat(params: any) {
              return {
                model: params.model,
                message: { role: "assistant", content: "Ollama chat mock response" },
                done: true,
                prompt_eval_count: 12,
                eval_count: 7
              };
            }
            async generate(params: any) {
              return {
                model: params.model,
                response: "Ollama generate mock response",
                done: true,
                prompt_eval_count: 9,
                eval_count: 5
              };
            }
          }
        };
      } else if (id === "@huggingface/inference") {
        mockCache[id] = {
          HfInference: class MockHfInference {
            static __aurex_patched__ = false;
            async chatCompletion(params: any) {
              return {
                choices: [{ message: { role: "assistant", content: "Hugging Face chat mock response" } }],
                usage: { prompt_tokens: 6, completion_tokens: 4 }
              };
            }
            async textGeneration(params: any) {
              return "Hugging Face generate mock response";
            }
            async textGenerationStream(params: any) {
              async function* mockStream() {
                yield { token: { text: "Hugging " } };
                yield { token: { text: "Face " } };
                yield { token: { text: "stream" } };
              }
              return mockStream();
            }
          }
        };
      }
    }
    return mockCache[id];
  }
  return originalRequire.apply(this, arguments as any);
};

// Import Aurex SDK components
import { AurexAuditor, AurexConfig, normalizeModelName, getModelPricing, calculateCost } from "./index";

async function runTests() {
  console.log("Running Node SDK Patcher & Integration Tests...");

  // Reset singleton
  AurexAuditor.reset();

  // Test 1: Pricing normalization and values
  console.log("  1. Testing model pricing & normalization...");
  assert.strictEqual(normalizeModelName("google/gemini-2.5-flash"), "gemini-2.5-flash");
  assert.strictEqual(normalizeModelName("openrouter/deepseek/deepseek-r1"), "deepseek-r1");
  assert.strictEqual(normalizeModelName("ft:gpt-4o-mini-2024-07-18:my-org::abc123"), "gpt-4o-mini-2024-07-18");

  const [deepseekIn, deepseekOut] = getModelPricing("deepseek-r1");
  assert.strictEqual(deepseekIn, 0.55);
  assert.strictEqual(deepseekOut, 2.19);

  const [opusIn, opusOut] = getModelPricing("claude-opus-4");
  assert.strictEqual(opusIn, 15.00);
  assert.strictEqual(opusOut, 75.00);

  // Test 2: Semantic cache suggestion callback hooks
  console.log("  2. Testing semantic cache suggestion hooks...");
  let onHitCalled = false;
  let onMissCalled = false;
  
  const config = {
    apiKey: "test-api-key",
    localOnly: true,
    flushIntervalMs: 50,
    autoDowngradeSimplePrompts: false,
    onCacheHit: (wfId: string, prompt: string) => {
      onHitCalled = true;
      return "Cached response data";
    },
    onCacheMiss: (wfId: string, prompt: string) => {
      onMissCalled = true;
    }
  };

  const auditor = AurexAuditor.getInstance(config);

  // First call should miss cache
  const dec1 = auditor.preCallCheck({
    model: "gpt-4o",
    prompt: "Tell me a joke about programming",
    workflowId: "wf-123"
  });
  assert.strictEqual(dec1.action, "proceed");
  assert.strictEqual(onMissCalled, true);
  assert.strictEqual(onHitCalled, false);

  // Log the first call so it enters recent requests history
  auditor.logEvent({
    model: "gpt-4o",
    prompt: "Tell me a joke about programming",
    response: "Why do programmers wear glasses? Because they can't C#!",
    workflowId: "wf-123"
  });

  // Second call with highly similar prompt should hit cache
  const dec2 = auditor.preCallCheck({
    model: "gpt-4o",
    prompt: "tell me a joke about programming", // slightly different casing
    workflowId: "wf-123"
  });
  assert.strictEqual(dec2.action, "cache_suggest");
  assert.strictEqual(dec2.response, "Cached response data");
  assert.strictEqual(onHitCalled, true);

  // Test 3: Smart Downgrade Complexity check
  console.log("  3. Testing smart downgrade complexity check...");
  (auditor as any).config.autoDowngradeSimplePrompts = true;
  
  // Simple prompt (less than 120 tokens, no code blocks) -> should downgrade from expensive model
  const decDowngrade = auditor.preCallCheck({
    model: "gpt-4o",
    prompt: "Hello there!",
    workflowId: "wf-simple"
  });
  assert.strictEqual(decDowngrade.action, "downgrade");
  assert.strictEqual(decDowngrade.suggestedModel, "gpt-4o-mini");

  // Complex prompt (contains code blocks) -> should NOT downgrade
  const decComplex = auditor.preCallCheck({
    model: "gpt-4o",
    prompt: "Fix this bug:\n```javascript\nconsole.log(a);\n```",
    workflowId: "wf-complex"
  });
  assert.strictEqual(decComplex.action, "proceed");

  // Test 4: OpenAI Patcher, tool calls, tags & quality score tracking
  console.log("  4. Testing OpenAI patcher & tracking...");
  auditor.patchOpenAI();
  const { OpenAI } = require("openai");
  const openaiClient = new OpenAI({ apiKey: "test" });
  
  const openaiResp = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Tell me a joke" }],
    tags: { env: "prod", user_tier: "premium" },
    qualityScore: 0.98,
    workflowId: "wf-openai"
  });
  
  assert.strictEqual(openaiResp.choices[0].message.content, "OpenAI mock response");

  // Wait for queue flush
  await new Promise(r => setTimeout(r, 100));
  auditor.flush();

  const health = auditor.getHealth();
  // Read ledger events to confirm logged properties
  const ledgerPath = ".aurex/ledger.jsonl";
  assert.strictEqual(fs.existsSync(ledgerPath), true);
  const events = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  
  const openaiEvent = events.find(e => e.workflow_id === "wf-openai");
  assert.ok(openaiEvent);
  assert.strictEqual(openaiEvent.tool_calls_count, 1);
  assert.deepStrictEqual(openaiEvent.tool_names, ["openai_tool"]);
  assert.deepStrictEqual(openaiEvent.tags, { env: "prod", user_tier: "premium" });
  assert.strictEqual(openaiEvent.quality_score, 0.98);

  // Test 5: Anthropic Patcher
  console.log("  5. Testing Anthropic patcher...");
  auditor.patchAnthropic();
  const { Anthropic } = require("@anthropic-ai/sdk");
  const anthropicClient = new Anthropic({ apiKey: "test" });
  
  const anthropicResp = await anthropicClient.messages.create({
    model: "claude-3-5-sonnet",
    messages: [{ role: "user", content: "Hi" }],
    tags: { client: "anthropic-test" },
    workflowId: "wf-anthropic"
  });
  assert.strictEqual(anthropicResp.content[0].text, "Anthropic mock response");

  // Wait for queue flush
  await new Promise(r => setTimeout(r, 100));
  auditor.flush();

  const events2 = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const anthropicEvent = events2.find(e => e.workflow_id === "wf-anthropic");
  assert.ok(anthropicEvent);
  assert.strictEqual(anthropicEvent.tool_calls_count, 1);
  assert.deepStrictEqual(anthropicEvent.tool_names, ["anthropic_tool"]);
  assert.deepStrictEqual(anthropicEvent.tags, { client: "anthropic-test" });

  // Test 6: Google GenAI Patcher
  console.log("  6. Testing Google GenAI patcher...");
  auditor.patchGoogle();
  const { GoogleGenAI } = require("@google/genai");
  const googleClient = new GoogleGenAI({ apiKey: "test" });
  
  const googleResp = await googleClient.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Hi Gemini",
    tags: { mode: "google-test" },
    workflowId: "wf-google"
  });
  assert.strictEqual(googleResp.text, "Google mock response");

  // Wait for queue flush
  await new Promise(r => setTimeout(r, 100));
  auditor.flush();

  const events3 = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const googleEvent = events3.find(e => e.workflow_id === "wf-google");
  assert.ok(googleEvent);
  assert.strictEqual(googleEvent.provider, "google");
  assert.strictEqual(googleEvent.input_tokens, 15);
  assert.strictEqual(googleEvent.output_tokens, 6);
  assert.deepStrictEqual(googleEvent.tags, { mode: "google-test" });

  // Test 7: Ollama Patcher
  console.log("  7. Testing Ollama patcher...");
  auditor.patchOllama();
  const { Ollama } = require("ollama");
  const ollamaClient = new Ollama();
  
  const ollamaChatResp = await ollamaClient.chat({
    model: "llama-4-scout",
    messages: [{ role: "user", content: "Hi Ollama" }],
    tags: { env: "ollama-test" },
    workflowId: "wf-ollama-chat"
  });
  assert.strictEqual(ollamaChatResp.message.content, "Ollama chat mock response");

  const ollamaGenResp = await ollamaClient.generate({
    model: "llama-4-scout",
    prompt: "Generate text",
    tags: { env: "ollama-test-gen" },
    workflowId: "wf-ollama-gen"
  });
  assert.strictEqual(ollamaGenResp.response, "Ollama generate mock response");

  // Wait for queue flush
  await new Promise(r => setTimeout(r, 100));
  auditor.flush();

  const events4 = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const ollamaChatEvent = events4.find(e => e.workflow_id === "wf-ollama-chat");
  assert.ok(ollamaChatEvent);
  assert.strictEqual(ollamaChatEvent.provider, "ollama");
  assert.strictEqual(ollamaChatEvent.input_tokens, 12);
  assert.strictEqual(ollamaChatEvent.output_tokens, 7);
  
  const ollamaGenEvent = events4.find(e => e.workflow_id === "wf-ollama-gen");
  assert.ok(ollamaGenEvent);
  assert.strictEqual(ollamaGenEvent.provider, "ollama");
  assert.strictEqual(ollamaGenEvent.input_tokens, 9);
  assert.strictEqual(ollamaGenEvent.output_tokens, 5);

  // Test 8: Dynamic custom pricing JSON & wildcards
  console.log("  8. Testing dynamic custom pricing and wildcards...");
  const tempPricingPath = "./test_custom_pricing.json";
  fs.writeFileSync(tempPricingPath, JSON.stringify({
    "custom-node-model": { input: 12.34, output: 56.78 },
    "custom-node-wildcard-*": { input: 3.33, output: 4.44 }
  }));
  
  try {
    AurexAuditor.reset();
    const configCustom = {
      apiKey: "test-api-key",
      localOnly: true,
      pricingPath: tempPricingPath
    };
    const auditorCustom = AurexAuditor.getInstance(configCustom);
    
    // 1. Exact Match
    const [cIn, cOut] = getModelPricing("custom-node-model");
    assert.strictEqual(cIn, 12.34);
    assert.strictEqual(cOut, 56.78);
    
    // 2. Wildcard Match
    const [wcIn, wcOut] = getModelPricing("custom-node-wildcard-model");
    assert.strictEqual(wcIn, 3.33);
    assert.strictEqual(wcOut, 4.44);
    
    // 3. Programmatic Match
    auditorCustom.registerModelPricing("custom-node-prog", 7.77, 8.88);
    const [pIn, pOut] = getModelPricing("custom-node-prog");
    assert.strictEqual(pIn, 7.77);
    assert.strictEqual(pOut, 8.88);
  } finally {
    if (fs.existsSync(tempPricingPath)) {
      fs.unlinkSync(tempPricingPath);
    }
  }

  // Test 9: Context overrides
  console.log("  9. Testing context overrides...");
  AurexAuditor.reset();
  const configCtx = {
    apiKey: "test-api-key",
    localOnly: true,
    simplePromptTokenLimit: 120,
    autoDowngradeSimplePrompts: true
  };
  const auditorCtx = AurexAuditor.getInstance(configCtx);
  
  // Under defaults: prompt of 10 tokens < 120 -> simple prompt -> autoDowngrade simple prompts triggers downgrade
  const decDefault = auditorCtx.preCallCheck({
    model: "gpt-4o",
    prompt: "Hello",
    workflowId: "wf-ctx"
  });
  assert.strictEqual(decDefault.action, "downgrade");
  
  // Wrap with options override: simplePromptTokenLimit = 2
  // Prompt is "Hello" (~2 tokens, so >= 2 -> not simple)
  let wrapCalled = false;
  await auditorCtx.wrap(
    async (params) => {
      wrapCalled = true;
      assert.strictEqual(params.model, "gpt-4o"); // should not be downgraded!
      return { choices: [{ message: { content: "ok" } }] };
    },
    () => ({ model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] }),
    { simplePromptTokenLimit: 0 }
  );
  assert.strictEqual(wrapCalled, true);

  // Test 10: Hugging Face Patching
  console.log("  10. Testing Hugging Face patching...");
  AurexAuditor.reset();
  const auditorHF = AurexAuditor.getInstance({
    apiKey: "test-api-key",
    localOnly: true,
    ledgerPath
  });
  auditorHF.patchHuggingFace();
  
  const { HfInference } = require("@huggingface/inference");
  const hfClient = new HfInference("hf-token");
  
  const hfResp = await hfClient.chatCompletion({
    model: "meta-llama/Llama-3-8b-Instruct",
    messages: [{ role: "user", content: "Hello HF" }],
    workflowId: "wf-hf-test"
  });
  assert.strictEqual(hfResp.choices[0].message.content, "Hugging Face chat mock response");
  
  // Wait for queue flush
  await new Promise(r => setTimeout(r, 100));
  auditorHF.flush();
  
  if (fs.existsSync(ledgerPath)) {
    const hfEvents = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    const hfEvent = hfEvents.find(e => e.workflow_id === "wf-hf-test");
    assert.ok(hfEvent);
    assert.strictEqual(hfEvent.provider, "huggingface");
    assert.strictEqual(hfEvent.cost, 0.0);
  }

  console.log("All Node SDK tests passed successfully!");
  
  // Cleanup ledger
  if (fs.existsSync(ledgerPath)) {
    fs.unlinkSync(ledgerPath);
  }
  process.exit(0);
}

import fs from "fs";
runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
