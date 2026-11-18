/**
 * Modular provider SDK auto-instrumentation adapters for Node.js (both CJS require and ESM import!)
 * with upstream drift diagnostics.
 */
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { pathToFileURL } from "url";
import type { AurexDecision } from "./decisions";
import { applyDecisionToCallParams } from "./decisions";
import { AurexBlocked, AurexBudgetExceeded, AurexProviderDriftError } from "./exceptions";
import { appendTailInstruction } from "./prefix_shield";
import { normalizeModelName } from "./pricing";
import {
  StreamUsageAccumulator,
  createStreamProxy,
  ensureOpenAIStreamUsage,
  extractAnthropicResponseDetails,
  extractClientBaseUrl,
  extractMessagesPrompts,
  extractOpenAIResponseDetails,
  extractResponsesApiUsage,
  normalizeResponsesApiInput,
  reportProviderDrift,
  resolveEndpointProvider,
  sanitizeThinkingParams,
  stripAurexParams,
} from "./runtime_guard";
import { resolveWorkflowId } from "./state_store";

// Preserve native ESM import() even when compiled by tsc with "module": "commonjs"
const _nativeImport: (spec: string) => Promise<any> = new Function(
  "spec",
  "return import(spec)",
) as any;

function resolveEsmUrl(pkg: string): string | null {
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const resolved = req.resolve(pkg);
    let dir = path.dirname(resolved);
    while (dir !== path.dirname(dir)) {
      const pjPath = path.join(dir, "package.json");
      if (fs.existsSync(pjPath)) {
        const pj = JSON.parse(fs.readFileSync(pjPath, "utf-8"));
        if (pj.name === pkg) {
          const exp = pj.exports?.["."];
          let rel =
            typeof exp === "object"
              ? exp.node?.import || exp.node?.default || exp.import?.default || exp.import || exp.default
              : pj.module;
          if (rel && typeof rel === "object") rel = rel.import || rel.default;
          if (typeof rel === "string") return pathToFileURL(path.resolve(dir, rel)).href;
          break;
        }
      }
      dir = path.dirname(dir);
    }
    return pathToFileURL(resolved).href;
  } catch {
    return null;
  }
}

function findPrototypeOwner(obj: any, prop: string): any {
  let curr = obj;
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, prop)) return curr;
    curr = Object.getPrototypeOf(curr);
  }
  return null;
}

function createLazyApiPromise<T>(run: (withResponse: boolean) => Promise<any>): Promise<T> {
  let mainP: Promise<T> | null = null;
  const getMain = () => (mainP ??= run(false));
  const lazy: any = {
    then: (onRes?: any, onRej?: any) => getMain().then(onRes, onRej),
    catch: (onRej?: any) => getMain().catch(onRej),
    finally: (onFin?: any) => getMain().finally(onFin),
    _thenUnwrap: (fn: (d: T) => any) =>
      createLazyApiPromise((wr) =>
        wr ? run(true).then((r: any) => ({ ...r, data: fn(r.data) })) : getMain().then(fn),
      ),
    withResponse: () => run(true),
    asResponse: async () => (await run(true)).response,
    [Symbol.toStringTag]: "Promise",
  };
  return lazy as Promise<T>;
}

function mergeDecisionMeta(aurexMeta: Record<string, any>, decision?: AurexDecision, origModel?: any): void {
  if (!decision) return;
  if (decision.action === "downgrade" && decision.suggestedModel) {
    aurexMeta.aurex_original_model = decision.originalModel || origModel;
    aurexMeta.aurex_model_downgraded = true;
  }
  if (decision.shieldMeta && Object.keys(decision.shieldMeta).length > 0) {
    aurexMeta.stage1_shield = decision.shieldMeta;
  }
}

function shouldRethrow(auditor: any, err: unknown, decision?: AurexDecision): boolean {
  if (
    err instanceof AurexBlocked ||
    err instanceof AurexBudgetExceeded ||
    err instanceof AurexProviderDriftError
  ) {
    return true;
  }
  if (decision?.action === "block") return true;
  return process.env.AUREX_BLOCK_ON_WASTE === "1" || auditor.budgetConfig?.onBudgetExceeded === "throw";
}

function emitDrift(auditor: any, provider: string, mod: any, symbol: string, message: string): void {
  auditor.patchStatus[provider] = `drift:${symbol}`;
  reportProviderDrift({
    provider,
    missingSymbol: symbol,
    message,
    providerVersion: mod?.VERSION || mod?.version,
    strict: Boolean(auditor.config?.strictProviderDrift),
    driftLog: auditor.driftWarnings,
  });
}

function buildMockCacheResponse(provider: string, text: string, stream: boolean): any {
  if (provider === "anthropic") {
    if (stream) {
      return (async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      })();
    }
    return { content: [{ type: "text", text }], usage: { input_tokens: 0, output_tokens: 0 } };
  }
  if (provider === "google") {
    const chunk = { text, usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
    if (stream) {
      return (async function* () {
        yield chunk;
      })();
    }
    return chunk;
  }
  if (provider === "ollama") {
    return { model: "cached", message: { role: "assistant", content: text }, response: text, done: true, prompt_eval_count: 0, eval_count: 0 };
  }
  if (stream) {
    return (async function* () {
      yield { choices: [{ delta: { content: text } }] };
    })();
  }
  return { choices: [{ message: { role: "assistant", content: text } }], usage: { prompt_tokens: 0, completion_tokens: 0 } };
}

function runPreCheck(
  auditor: any,
  cleanParams: Record<string, any>,
  opts: {
    provider: string;
    workflowId: string;
    userPrompt?: string;
    systemPrompt?: any;
    messages?: any[];
    tenantId?: string;
    aurexMeta: Record<string, any>;
    responseFormat?: any;
  },
): { params: Record<string, any>; cachedResponse?: any } {
  let decision: AurexDecision | undefined;
  const origModel = cleanParams.model || "unknown";
  try {
    const dec: AurexDecision = auditor.preCallCheck({
      model: origModel,
      prompt: opts.userPrompt,
      systemPrompt: opts.systemPrompt,
      workflowId: opts.workflowId,
      messages: opts.messages,
      tools: cleanParams.tools,
      responseFormat: opts.responseFormat ?? cleanParams.response_format,
      tenantId: opts.tenantId,
    });
    decision = dec;
    if (dec.action === "cache_suggest" && dec.response) {
      return {
        params: cleanParams,
        cachedResponse: buildMockCacheResponse(opts.provider, dec.response, Boolean(cleanParams.stream)),
      };
    }
    const updated = applyDecisionToCallParams(cleanParams, dec);
    mergeDecisionMeta(opts.aurexMeta, dec, origModel);
    return { params: updated };
  } catch (err: any) {
    if (shouldRethrow(auditor, err, decision)) throw err;
    console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err?.message || err}`);
    return { params: cleanParams };
  }
}

function patchOpenAIModulePrototypes(auditor: any, openaiMod: any, ctxStore: any): boolean {
  const Cls = openaiMod?.default || openaiMod?.OpenAI;
  if (!Cls || typeof Cls !== "function") {
    emitDrift(auditor, "openai", openaiMod, "OpenAI", "OpenAI Node SDK layout changed: missing OpenAI constructor");
    return false;
  }

  let probe: any;
  try {
    probe = new Cls({ apiKey: "aurex-prototype-probe" });
  } catch {
    return false;
  }

  const compProto = probe?.chat?.completions ? findPrototypeOwner(Object.getPrototypeOf(probe.chat.completions), "create") : null;
  if (!compProto) {
    emitDrift(auditor, "openai", openaiMod, "chat.completions.create", "OpenAI instance missing chat.completions.create");
    return false;
  }

  if (!compProto.create.__aurex_patched__) {
    const origCreate = compProto.create;
    const patchedCreate: any = function (this: any, ...callArgs: any[]) {
      const resourceSelf = this;
      return createLazyApiPromise(async (wantWithResp) => {
        // Resolve current active auditor singleton dynamically so AurexAuditor.reset() works across tests!
        const activeAuditor = (auditor.constructor as any).instance || auditor;
        const ctx = ctxStore.getStore() || {};
        const rawParams = callArgs[0] || {};
        const ex = stripAurexParams(rawParams, { provider: "openai", ctx });
        const wf = resolveWorkflowId(ex.workflowId, ctx);
        await activeAuditor.stateStore.syncWorkflow?.(wf);
        const { systemPrompt, userPrompt } = extractMessagesPrompts(ex.cleanParams.messages);
        const pre = runPreCheck(activeAuditor, ex.cleanParams, {
          provider: "openai",
          workflowId: wf,
          userPrompt,
          systemPrompt,
          messages: ex.cleanParams.messages,
          tenantId: ex.tenantId,
          aurexMeta: ex.extraMetadata,
        });
        if (pre.cachedResponse !== undefined) {
          return wantWithResp ? { data: pre.cachedResponse, response: {} } : pre.cachedResponse;
        }
        const finalParams = ensureOpenAIStreamUsage(pre.params);
        const nextArgs = [...callArgs];
        nextArgs[0] = finalParams;
        if (activeAuditor.resiliencePolicy.enabled && activeAuditor.resiliencePolicy.mode === "enforce") {
          nextArgs[1] = { ...(nextArgs[1] || {}), maxRetries: 0 };
        }
        const model = String(finalParams.model || "unknown");
        const prov = resolveEndpointProvider(model, extractClientBaseUrl(resourceSelf, finalParams));

        const rawResult = await activeAuditor.callWithResilience(
          () => (wantWithResp ? origCreate.apply(resourceSelf, nextArgs).withResponse() : origCreate.apply(resourceSelf, nextArgs)),
          { provider: prov, workflowId: wf, model },
        );
        const data = wantWithResp ? rawResult.data : rawResult;

        if (finalParams.stream) {
          const proxied = activeAuditor.wrapStream(
            data, finalParams, wf, userPrompt || "", systemPrompt || "",
            false, ex.tags, ex.qualityScore, prov, ex.extraMetadata,
          );
          return wantWithResp ? { ...rawResult, data: proxied } : proxied;
        }

        try {
          const det = extractOpenAIResponseDetails(data);
          if (det.responseText) activeAuditor.recordResponse(wf, det.responseText);
          activeAuditor.logEvent({
            model,
            prompt: userPrompt,
            response: det.responseText,
            inputTokens: det.inputTokens,
            outputTokens: det.outputTokens,
            cachedTokens: det.cachedTokens,
            reasoningTokens: det.reasoningTokens,
            systemPrompt,
            extraMetadata: { ...ex.extraMetadata, ...(finalParams.metadata || {}) },
            workflowId: wf,
            tags: ex.tags,
            qualityScore: ex.qualityScore,
            toolCallsCount: det.toolCallsCount,
            toolNames: det.toolNames,
            provider: prov,
            finishReason: det.finishReason,
          });
        } catch (e) {
          if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
        }
        return wantWithResp ? rawResult : data;
      });
    };
    patchedCreate.__aurex_patched__ = true;
    compProto.create = patchedCreate;
  }

  const respProto = probe?.responses ? findPrototypeOwner(Object.getPrototypeOf(probe.responses), "create") : null;
  if (respProto && !respProto.create.__aurex_patched__) {
    const origRespCreate = respProto.create;
    const patchedResp: any = function (this: any, ...callArgs: any[]) {
      const resourceSelf = this;
      return createLazyApiPromise(async (wantWithResp) => {
        const activeAuditor = (auditor.constructor as any).instance || auditor;
        const ctx = ctxStore.getStore() || {};
        const rawParams = callArgs[0] || {};
        const ex = stripAurexParams(rawParams, { provider: "openai", ctx });
        const wf = resolveWorkflowId(ex.workflowId, ctx);
        await activeAuditor.stateStore.syncWorkflow?.(wf);
        const { userPrompt, systemPrompt, messages } = normalizeResponsesApiInput(ex.cleanParams);
        const pre = runPreCheck(activeAuditor, ex.cleanParams, {
          provider: "openai",
          workflowId: wf,
          userPrompt,
          systemPrompt,
          messages,
          tenantId: ex.tenantId,
          aurexMeta: ex.extraMetadata,
          responseFormat: ex.cleanParams.text,
        });
        const finalParams = pre.params;
        const nextArgs = [...callArgs];
        nextArgs[0] = finalParams;
        if (activeAuditor.resiliencePolicy.enabled && activeAuditor.resiliencePolicy.mode === "enforce") {
          nextArgs[1] = { ...(nextArgs[1] || {}), maxRetries: 0 };
        }
        const model = String(finalParams.model || "unknown");
        const prov = resolveEndpointProvider(model, extractClientBaseUrl(resourceSelf, finalParams));
        const rawResult = await activeAuditor.callWithResilience(
          () => (wantWithResp ? origRespCreate.apply(resourceSelf, nextArgs).withResponse() : origRespCreate.apply(resourceSelf, nextArgs)),
          { provider: prov, workflowId: wf, model },
        );
        const data = wantWithResp ? rawResult.data : rawResult;

        if (finalParams.stream) {
          const proxied = activeAuditor.wrapStream(
            data, { ...finalParams, messages }, wf, userPrompt || "", systemPrompt || "",
            false, ex.tags, ex.qualityScore, prov, ex.extraMetadata,
          );
          return wantWithResp ? { ...rawResult, data: proxied } : proxied;
        }

        try {
          const u = extractResponsesApiUsage(data);
          if (u.responseText) activeAuditor.recordResponse(wf, u.responseText);
          activeAuditor.logEvent({
            model,
            prompt: userPrompt,
            response: u.responseText,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            cachedTokens: u.cachedTokens,
            reasoningTokens: u.reasoningTokens,
            systemPrompt,
            extraMetadata: { ...ex.extraMetadata, ...(finalParams.metadata || {}) },
            workflowId: wf,
            tags: ex.tags,
            qualityScore: ex.qualityScore,
            provider: prov,
            finishReason: u.finishReason,
          });
        } catch (e) {
          if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
        }
        return wantWithResp ? rawResult : data;
      });
    };
    patchedResp.__aurex_patched__ = true;
    respProto.create = patchedResp;
  }

  return true;
}

export function patchOpenAISdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  let cjsOk = false;
  try {
    const cjsMod = safeRequire("openai");
    cjsOk = patchOpenAIModulePrototypes(auditor, cjsMod, ctxStore);
    if (cjsOk) auditor.patchStatus.openai = "patched";
  } catch {
    auditor.patchStatus.openai = "not_installed";
  }
  const esmUrl = resolveEsmUrl("openai");
  if (!esmUrl) return Promise.resolve();
  return _nativeImport(esmUrl)
    .then((esmMod) => {
      if (patchOpenAIModulePrototypes(auditor, esmMod, ctxStore)) {
        auditor.patchStatus.openai = "patched";
      }
    })
    .catch(() => {});
}

function patchAnthropicModulePrototypes(auditor: any, anthropicMod: any, ctxStore: any): boolean {
  const Cls = anthropicMod?.default || anthropicMod?.Anthropic;
  if (!Cls || typeof Cls !== "function") {
    emitDrift(auditor, "anthropic", anthropicMod, "Anthropic", "Anthropic SDK layout changed: missing Anthropic constructor");
    return false;
  }
  let probe: any;
  try {
    probe = new Cls({ apiKey: "aurex-prototype-probe" });
  } catch {
    return false;
  }
  const msgProto = probe?.messages ? findPrototypeOwner(Object.getPrototypeOf(probe.messages), "create") : null;
  if (!msgProto) {
    emitDrift(auditor, "anthropic", anthropicMod, "messages.create", "Anthropic instance missing messages.create");
    return false;
  }

  if (!msgProto.create.__aurex_patched__) {
    const origCreate = msgProto.create;
    const patched: any = function (this: any, ...callArgs: any[]) {
      const resourceSelf = this;
      return createLazyApiPromise(async (wantWithResp) => {
        const activeAuditor = (auditor.constructor as any).instance || auditor;
        const ctx = ctxStore.getStore() || {};
        const rawParams = callArgs[0] || {};
        const ex = stripAurexParams(rawParams, { provider: "anthropic", ctx });
        const wf = resolveWorkflowId(ex.workflowId, ctx);
        await activeAuditor.stateStore.syncWorkflow?.(wf);
        const rawSys = ex.cleanParams.system;
        const { userPrompt } = extractMessagesPrompts(ex.cleanParams.messages);
        const pre = runPreCheck(activeAuditor, ex.cleanParams, {
          provider: "anthropic",
          workflowId: wf,
          userPrompt,
          systemPrompt: rawSys,
          messages: ex.cleanParams.messages,
          tenantId: ex.tenantId,
          aurexMeta: ex.extraMetadata,
        });
        if (pre.cachedResponse !== undefined) {
          return wantWithResp ? { data: pre.cachedResponse, response: {} } : pre.cachedResponse;
        }
        const finalParams = pre.params;
        const nextArgs = [...callArgs];
        nextArgs[0] = finalParams;
        if (activeAuditor.resiliencePolicy.enabled && activeAuditor.resiliencePolicy.mode === "enforce") {
          nextArgs[1] = { ...(nextArgs[1] || {}), maxRetries: 0 };
        }
        const model = String(finalParams.model || "unknown");
        const rawResult = await activeAuditor.callWithResilience(
          () => (wantWithResp ? origCreate.apply(resourceSelf, nextArgs).withResponse() : origCreate.apply(resourceSelf, nextArgs)),
          { provider: "anthropic", workflowId: wf, model },
        );
        const data = wantWithResp ? rawResult.data : rawResult;

        if (finalParams.stream) {
          const proxied = activeAuditor.wrapStream(
            data, finalParams, wf, userPrompt || "", rawSys,
            true, ex.tags, ex.qualityScore, "anthropic", ex.extraMetadata,
          );
          return wantWithResp ? { ...rawResult, data: proxied } : proxied;
        }

        try {
          const det = extractAnthropicResponseDetails(data);
          if (det.responseText) activeAuditor.recordResponse(wf, det.responseText);
          activeAuditor.logEvent({
            model,
            prompt: userPrompt,
            response: det.responseText,
            inputTokens: det.inputTokens,
            outputTokens: det.outputTokens,
            cachedTokens: det.cachedTokens,
            cacheWriteTokens: det.cacheWriteTokens,
            cacheWrite1hTokens: det.cacheWrite1hTokens,
            reasoningTokens: det.reasoningTokens,
            systemPrompt: rawSys,
            extraMetadata: { ...ex.extraMetadata, ...(finalParams.metadata || {}) },
            workflowId: wf,
            tags: ex.tags,
            qualityScore: ex.qualityScore,
            toolCallsCount: det.toolCallsCount,
            toolNames: det.toolNames,
            provider: "anthropic",
            finishReason: det.finishReason,
          });
        } catch (e) {
          if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
        }
        return wantWithResp ? rawResult : data;
      });
    };
    patched.__aurex_patched__ = true;
    msgProto.create = patched;
  }
  return true;
}

export function patchAnthropicSdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  try {
    const cjsMod = safeRequire("@anthropic-ai/sdk");
    if (patchAnthropicModulePrototypes(auditor, cjsMod, ctxStore)) {
      auditor.patchStatus.anthropic = "patched";
    }
  } catch {
    auditor.patchStatus.anthropic = "not_installed";
  }
  const esmUrl = resolveEsmUrl("@anthropic-ai/sdk");
  if (!esmUrl) return Promise.resolve();
  return _nativeImport(esmUrl)
    .then((esmMod) => {
      if (patchAnthropicModulePrototypes(auditor, esmMod, ctxStore)) {
        auditor.patchStatus.anthropic = "patched";
      }
    })
    .catch(() => {});
}

function prepareGoogleParams(auditor: any, rawParams: Record<string, any>, ctx: Record<string, any>, isStream: boolean) {
  const ex = stripAurexParams(rawParams, { provider: "google", ctx });
  const wf = resolveWorkflowId(ex.workflowId, ctx);
  const clean = ex.cleanParams;
  let model = String(clean.model || "gemini-2.5-flash");
  const contents = clean.contents;
  const userPrompt =
    typeof contents === "string"
      ? contents
      : Array.isArray(contents)
        ? contents.map((c: any) => (typeof c === "string" ? c : c?.text || JSON.stringify(c))).join(" ")
        : contents
          ? JSON.stringify(contents)
          : "";
  let systemPrompt = "";
  const cfg = clean.config;
  if (cfg?.systemInstruction) {
    systemPrompt =
      typeof cfg.systemInstruction === "string"
        ? cfg.systemInstruction
        : Array.isArray(cfg.systemInstruction.parts)
          ? cfg.systemInstruction.parts.map((p: any) => p?.text || "").join(" ")
          : String(cfg.systemInstruction);
  }
  let decision: AurexDecision | undefined;
  try {
    const dec: AurexDecision = auditor.preCallCheck({
      model: normalizeModelName(model),
      prompt: userPrompt,
      systemPrompt,
      workflowId: wf,
      messages: Array.isArray(contents) ? contents : undefined,
      tenantId: ex.tenantId,
    });
    decision = dec;
    if (dec.action === "cache_suggest" && dec.response) {
      return { clean, wf, model, userPrompt, systemPrompt, ex, cached: buildMockCacheResponse("google", dec.response, isStream) };
    }
    let downgraded = false;
    if (dec.action === "downgrade" && dec.suggestedModel) {
      clean.model = dec.suggestedModel;
      model = dec.suggestedModel;
      downgraded = true;
    }
    if (dec.injectSystemInstruction) {
      const tail = appendTailInstruction({ contents: clean.contents }, dec.injectSystemInstruction);
      clean.contents = tail.contents;
    }
    const sanitized = sanitizeThinkingParams(clean, {
      isDowngraded: downgraded,
      maxThinkingTokens: dec.maxThinkingTokens,
    });
    Object.assign(clean, sanitized);
    mergeDecisionMeta(ex.extraMetadata, dec, model);
    if (dec.action === "block") {
      throw new AurexBlocked(`[Aurex] Blocked: ${dec.reason}`, { workflowId: wf, reason: dec.reason, action: "block" });
    }
  } catch (err: any) {
    if (shouldRethrow(auditor, err, decision)) throw err;
    console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err?.message || err}`);
  }
  return { clean, wf, model, userPrompt, systemPrompt, ex, cached: undefined };
}

function patchGoogleModulePrototypes(auditor: any, googleMod: any, ctxStore: any): boolean {
  const Cls = googleMod?.GoogleGenAI;
  if (!Cls || typeof Cls !== "function") {
    emitDrift(auditor, "google", googleMod, "GoogleGenAI", "@google/genai layout changed: missing GoogleGenAI constructor");
    return false;
  }
  let probe: any;
  try {
    probe = new Cls({ apiKey: "aurex-prototype-probe" });
  } catch {
    return false;
  }
  const modelsProto = probe?.models ? findPrototypeOwner(Object.getPrototypeOf(probe.models), "generateContentInternal") : null;
  if (!modelsProto) {
    emitDrift(auditor, "google", googleMod, "Models.prototype.generateContentInternal", "@google/genai Models missing generateContentInternal");
    return false;
  }

  if (!modelsProto.generateContentInternal.__aurex_patched__) {
    const origGen = modelsProto.generateContentInternal;
    const patchedGen: any = async function (this: any, ...args: any[]) {
      const activeAuditor = (auditor.constructor as any).instance || auditor;
      const ctx = ctxStore.getStore() || {};
      const prep = prepareGoogleParams(activeAuditor, args[0] || {}, ctx, false);
      await activeAuditor.stateStore.syncWorkflow?.(prep.wf);
      if (prep.cached !== undefined) return prep.cached;
      const nextArgs = [...args];
      nextArgs[0] = prep.clean;
      const resp = await activeAuditor.callWithResilience(() => origGen.apply(this, nextArgs), {
        provider: "google",
        workflowId: prep.wf,
        model: prep.model,
      });
      try {
        const usage = resp?.usageMetadata || {};
        const thoughts = Number(usage.thoughtsTokenCount || 0);
        if (resp?.text) activeAuditor.recordResponse(prep.wf, resp.text);
        activeAuditor.logEvent({
          model: prep.model,
          prompt: prep.userPrompt,
          response: resp?.text,
          inputTokens: Number(usage.promptTokenCount || 0),
          outputTokens: Number(usage.candidatesTokenCount || 0) + thoughts,
          cachedTokens: Number(usage.cachedContentTokenCount || 0),
          reasoningTokens: thoughts,
          systemPrompt: prep.systemPrompt,
          extraMetadata: prep.ex.extraMetadata,
          workflowId: prep.wf,
          tags: prep.ex.tags,
          qualityScore: prep.ex.qualityScore,
          provider: "google",
        });
      } catch (e) {
        if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
      }
      return resp;
    };
    patchedGen.__aurex_patched__ = true;
    modelsProto.generateContentInternal = patchedGen;
  }

  if (typeof modelsProto.generateContentStreamInternal === "function" && !modelsProto.generateContentStreamInternal.__aurex_patched__) {
    const origStream = modelsProto.generateContentStreamInternal;
    const patchedStream: any = async function (this: any, ...args: any[]) {
      const activeAuditor = (auditor.constructor as any).instance || auditor;
      const ctx = ctxStore.getStore() || {};
      const prep = prepareGoogleParams(activeAuditor, args[0] || {}, ctx, true);
      await activeAuditor.stateStore.syncWorkflow?.(prep.wf);
      if (prep.cached !== undefined) return prep.cached;
      const nextArgs = [...args];
      nextArgs[0] = prep.clean;
      const resp = await activeAuditor.callWithResilience(() => origStream.apply(this, nextArgs), {
        provider: "google",
        workflowId: prep.wf,
        model: prep.model,
      });
      return activeAuditor.wrapStream(
        resp, { model: prep.model, messages: Array.isArray(prep.clean.contents) ? prep.clean.contents : undefined },
        prep.wf, prep.userPrompt, prep.systemPrompt, false, prep.ex.tags, prep.ex.qualityScore, "google", prep.ex.extraMetadata,
      );
    };
    patchedStream.__aurex_patched__ = true;
    modelsProto.generateContentStreamInternal = patchedStream;
  }
  return true;
}

export function patchGoogleSdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  try {
    const cjsMod = safeRequire("@google/genai");
    if (patchGoogleModulePrototypes(auditor, cjsMod, ctxStore)) {
      auditor.patchStatus.google = "patched";
    }
  } catch {
    auditor.patchStatus.google = "not_installed";
  }
  const esmUrl = resolveEsmUrl("@google/genai");
  if (!esmUrl) return Promise.resolve();
  return _nativeImport(esmUrl)
    .then((esmMod) => {
      if (patchGoogleModulePrototypes(auditor, esmMod, ctxStore)) {
        auditor.patchStatus.google = "patched";
      }
    })
    .catch(() => {});
}

export function patchLiteLLMSdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  let lite: any;
  try {
    lite = safeRequire("litellm");
  } catch {
    auditor.patchStatus.litellm = "not_installed";
    return Promise.resolve();
  }
  if (!lite || typeof lite.completion !== "function") {
    emitDrift(auditor, "litellm", lite, "completion", "LiteLLM Node package missing completion()");
    return Promise.resolve();
  }
  if (!lite.completion.__aurex_patched__) {
    const orig = lite.completion.bind(lite);
    const patched: any = async function (...args: any[]) {
      const activeAuditor = (auditor.constructor as any).instance || auditor;
      const ctx = ctxStore.getStore() || {};
      const ex = stripAurexParams(args[0] || {}, { provider: "litellm", ctx });
      const wf = resolveWorkflowId(ex.workflowId, ctx);
      const { systemPrompt, userPrompt } = extractMessagesPrompts(ex.cleanParams.messages);
      const prov = resolveEndpointProvider(String(ex.cleanParams.model || "unknown"), extractClientBaseUrl(null, ex.cleanParams));
      const pre = runPreCheck(activeAuditor, ex.cleanParams, {
        provider: prov, workflowId: wf, userPrompt, systemPrompt, messages: ex.cleanParams.messages, tenantId: ex.tenantId, aurexMeta: ex.extraMetadata,
      });
      if (pre.cachedResponse !== undefined) return pre.cachedResponse;
      const finalParams = ensureOpenAIStreamUsage(pre.params);
      const nextArgs = [...args];
      nextArgs[0] = finalParams;
      const model = String(finalParams.model || "unknown");
      const resp = await activeAuditor.callWithResilience(() => orig(...nextArgs), { provider: prov, workflowId: wf, model });
      if (finalParams.stream) {
        return activeAuditor.wrapStream(resp, finalParams, wf, userPrompt || "", systemPrompt || "", false, ex.tags, ex.qualityScore, prov, ex.extraMetadata);
      }
      const det = extractOpenAIResponseDetails(resp);
      if (det.responseText) activeAuditor.recordResponse(wf, det.responseText);
      activeAuditor.logEvent({
        model, prompt: userPrompt, response: det.responseText, inputTokens: det.inputTokens, outputTokens: det.outputTokens,
        cachedTokens: det.cachedTokens, reasoningTokens: det.reasoningTokens, systemPrompt, extraMetadata: ex.extraMetadata,
        workflowId: wf, tags: ex.tags, qualityScore: ex.qualityScore, toolCallsCount: det.toolCallsCount, toolNames: det.toolNames, provider: prov, finishReason: det.finishReason,
      });
      return resp;
    };
    patched.__aurex_patched__ = true;
    lite.completion = patched;
  }
  auditor.patchStatus.litellm = "patched";
  return Promise.resolve();
}

function patchOllamaProto(auditor: any, ollamaMod: any, ctxStore: any): boolean {
  const Cls = ollamaMod?.Ollama || ollamaMod?.default?.Ollama;
  const target = Cls?.prototype || ollamaMod?.default || ollamaMod;
  const owner = target ? findPrototypeOwner(target, "chat") || (typeof target.chat === "function" ? target : null) : null;
  if (!owner || typeof owner.chat !== "function") {
    emitDrift(auditor, "ollama", ollamaMod, "Ollama.prototype.chat", "ollama package missing chat()");
    return false;
  }
  if (!owner.chat.__aurex_patched__) {
    const origChat = owner.chat;
    const patchedChat: any = async function (this: any, ...args: any[]) {
      const activeAuditor = (auditor.constructor as any).instance || auditor;
      const ctx = ctxStore.getStore() || {};
      const ex = stripAurexParams(args[0] || {}, { provider: "ollama", ctx });
      const wf = resolveWorkflowId(ex.workflowId, ctx);
      const { systemPrompt, userPrompt } = extractMessagesPrompts(ex.cleanParams.messages);
      const pre = runPreCheck(activeAuditor, ex.cleanParams, {
        provider: "ollama", workflowId: wf, userPrompt, systemPrompt, messages: ex.cleanParams.messages, tenantId: ex.tenantId, aurexMeta: ex.extraMetadata,
      });
      if (pre.cachedResponse !== undefined) return pre.cachedResponse;
      const nextArgs = [...args];
      nextArgs[0] = pre.params;
      const model = String(pre.params.model || "llama-4-scout");
      const resp = await activeAuditor.callWithResilience(() => origChat.apply(this, nextArgs), { provider: "ollama", workflowId: wf, model });
      if (!pre.params.stream) {
        const content = resp?.message?.content;
        if (content) activeAuditor.recordResponse(wf, content);
        activeAuditor.logEvent({
          model, prompt: userPrompt, response: content, inputTokens: Number(resp?.prompt_eval_count || 0), outputTokens: Number(resp?.eval_count || 0),
          systemPrompt, extraMetadata: ex.extraMetadata, workflowId: wf, tags: ex.tags, qualityScore: ex.qualityScore, provider: "ollama",
        });
      }
      return resp;
    };
    patchedChat.__aurex_patched__ = true;
    owner.chat = patchedChat;
  }
  return true;
}

export function patchOllamaSdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  try {
    const cjsMod = safeRequire("ollama");
    if (patchOllamaProto(auditor, cjsMod, ctxStore)) auditor.patchStatus.ollama = "patched";
  } catch {
    auditor.patchStatus.ollama = "not_installed";
  }
  const esmUrl = resolveEsmUrl("ollama");
  if (!esmUrl) return Promise.resolve();
  return _nativeImport(esmUrl)
    .then((esmMod) => {
      if (patchOllamaProto(auditor, esmMod, ctxStore)) auditor.patchStatus.ollama = "patched";
    })
    .catch(() => {});
}

function patchHfProto(auditor: any, hfMod: any, ctxStore: any): boolean {
  const Cls = hfMod?.InferenceClient || hfMod?.HfInference;
  if (!Cls || typeof Cls !== "function") {
    emitDrift(auditor, "huggingface", hfMod, "InferenceClient", "@huggingface/inference missing InferenceClient");
    return false;
  }
  let owner = findPrototypeOwner(Cls.prototype, "chatCompletion");
  if (!owner) {
    try {
      const probe = new Cls("hf_aurex_probe");
      if (typeof probe.chatCompletion === "function") {
        // @huggingface/inference v4 attaches bound arrow methods on instance in constructor
        return true;
      }
      owner = findPrototypeOwner(Object.getPrototypeOf(probe), "chatCompletion");
    } catch {}
  }
  if (!owner || typeof owner.chatCompletion !== "function") {
    emitDrift(auditor, "huggingface", hfMod, "InferenceClient.chatCompletion", "@huggingface/inference missing chatCompletion()");
    return false;
  }
  if (!owner.chatCompletion.__aurex_patched__) {
    const orig = owner.chatCompletion;
    const patched: any = async function (this: any, ...args: any[]) {
      const activeAuditor = (auditor.constructor as any).instance || auditor;
      const ctx = ctxStore.getStore() || {};
      const ex = stripAurexParams(args[0] || {}, { provider: "huggingface", ctx });
      const wf = resolveWorkflowId(ex.workflowId, ctx);
      const { systemPrompt, userPrompt } = extractMessagesPrompts(ex.cleanParams.messages);
      const pre = runPreCheck(activeAuditor, ex.cleanParams, {
        provider: "huggingface", workflowId: wf, userPrompt, systemPrompt, messages: ex.cleanParams.messages, tenantId: ex.tenantId, aurexMeta: ex.extraMetadata,
      });
      const nextArgs = [...args];
      nextArgs[0] = pre.params;
      const model = String(pre.params.model || "unknown");
      const resp = await activeAuditor.callWithResilience(() => orig.apply(this, nextArgs), { provider: "huggingface", workflowId: wf, model });
      const det = extractOpenAIResponseDetails(resp);
      if (det.responseText) activeAuditor.recordResponse(wf, det.responseText);
      activeAuditor.logEvent({
        model, prompt: userPrompt, response: det.responseText, inputTokens: det.inputTokens, outputTokens: det.outputTokens,
        systemPrompt, extraMetadata: ex.extraMetadata, workflowId: wf, tags: ex.tags, qualityScore: ex.qualityScore, provider: "huggingface",
      });
      return resp;
    };
    patched.__aurex_patched__ = true;
    owner.chatCompletion = patched;
  }
  return true;
}

export function patchHuggingFaceSdk(auditor: any, safeRequire: (id: string) => any, ctxStore: any): Promise<void> {
  try {
    const cjsMod = safeRequire("@huggingface/inference");
    if (patchHfProto(auditor, cjsMod, ctxStore)) auditor.patchStatus.huggingface = "patched";
  } catch {
    auditor.patchStatus.huggingface = "not_installed";
  }
  return _nativeImport("@huggingface/inference")
    .then((esmMod) => {
      if (patchHfProto(auditor, esmMod, ctxStore)) auditor.patchStatus.huggingface = "patched";
    })
    .catch(() => {});
}

export function instrumentTarget(auditor: any, target: any, ctxStore: any): void {
  if (!target) return;
  if (typeof target === "function") {
    const n = String(target.name || "");
    if (n.includes("OpenAI") || target.OpenAI) {
      if (patchOpenAIModulePrototypes(auditor, { default: target }, ctxStore)) auditor.patchStatus.openai = "patched";
      return;
    }
    if (n.includes("Anthropic") || target.Anthropic) {
      if (patchAnthropicModulePrototypes(auditor, { default: target }, ctxStore)) auditor.patchStatus.anthropic = "patched";
      return;
    }
    if (n.includes("GoogleGenAI") || target.GoogleGenAI) {
      if (patchGoogleModulePrototypes(auditor, { GoogleGenAI: target }, ctxStore)) auditor.patchStatus.google = "patched";
      return;
    }
    if (n.includes("Ollama") || typeof target.prototype?.chat === "function") {
      if (patchOllamaProto(auditor, { Ollama: target }, ctxStore)) auditor.patchStatus.ollama = "patched";
      return;
    }
    if (n.includes("Inference") || n.includes("HfInference") || typeof target.prototype?.chatCompletion === "function") {
      if (patchHfProto(auditor, { InferenceClient: target }, ctxStore)) auditor.patchStatus.huggingface = "patched";
      return;
    }
    return;
  }
  if (typeof target === "object") {
    if (target.OpenAI) instrumentTarget(auditor, target.OpenAI, ctxStore);
    if (target.Anthropic) instrumentTarget(auditor, target.Anthropic, ctxStore);
    if (target.GoogleGenAI) instrumentTarget(auditor, target.GoogleGenAI, ctxStore);
    if (target.Ollama) instrumentTarget(auditor, target.Ollama, ctxStore);
    if (target.InferenceClient || target.HfInference) instrumentTarget(auditor, target.InferenceClient || target.HfInference, ctxStore);
    if (target.chat?.completions && target.constructor) instrumentTarget(auditor, target.constructor, ctxStore);
    if (target.messages?.create && target.constructor) instrumentTarget(auditor, target.constructor, ctxStore);
    if (target.models && target.constructor) instrumentTarget(auditor, target.constructor, ctxStore);
    if (typeof target.chat === "function") {
      if (patchOllamaProto(auditor, Object.getPrototypeOf(target), ctxStore)) auditor.patchStatus.ollama = "patched";
    }
  }
}

export { StreamUsageAccumulator, createStreamProxy };
