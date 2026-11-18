import http from "node:http";
import type { AddressInfo } from "node:net";

const FORBIDDEN_AUREX_WIRE_KEYS = [
  "workflow_id",
  "workflowId",
  "tags",
  "quality_score",
  "qualityScore",
  "tenant_id",
  "tenantId",
  "extra_metadata",
];

const NON_REASONING_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-nano",
  "claude-3-5-haiku",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
]);

export interface WireSpec {
  status?: number;
  json?: Record<string, any>;
  sse?: any[];
  abortAfterChunks?: number;
  errorMessage?: string;
}

export interface RecordedRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, any>;
}

export class WireServer {
  public requests: RecordedRequest[] = [];
  public baseUrl = "";
  private server: http.Server;
  private queue: WireSpec[] = [];

  constructor() {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  public async start(): Promise<this> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${addr.port}`;
    return this;
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  public reset(): void {
    this.requests = [];
    this.queue = [];
  }

  public enqueue(spec: WireSpec): void {
    this.queue.push(spec);
  }

  private validateStrictWire(urlPath: string, body: Record<string, any>): string | null {
    for (const k of FORBIDDEN_AUREX_WIRE_KEYS) {
      if (k in body) {
        return `Unrecognized Aurex parameter leaked onto wire: ${k}`;
      }
    }
    if (urlPath.includes("/messages") && "metadata" in body) {
      const m = body.metadata;
      if (!m || typeof m !== "object" || Object.keys(m).some((k) => k !== "user_id")) {
        return `Anthropic metadata only permits user_id, got: ${JSON.stringify(m)}`;
      }
    }
    if ((urlPath.includes(":generateContent") || urlPath.includes(":streamGenerateContent")) && "metadata" in body) {
      return "Google Gemini generateContent does not accept top-level metadata";
    }
    const model = String(body.model || "");
    if (NON_REASONING_MODELS.has(model)) {
      for (const rk of ["reasoning_effort", "reasoning", "thinking"]) {
        if (body[rk] !== undefined && body[rk] !== null) {
          return `Model '${model}' does not support reasoning parameter '${rk}'`;
        }
      }
    }
    return null;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      let body: Record<string, any> = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {}
      const urlPath = req.url || "/";
      this.requests.push({ path: urlPath, headers: req.headers, body });

      const wireErr = this.validateStrictWire(urlPath, body);
      if (wireErr) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: wireErr, type: "invalid_request_error" } }));
        return;
      }

      const spec = this.queue.shift() || {};
      const status = spec.status ?? 200;
      if (status >= 400) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(spec.json || { error: { message: spec.errorMessage || `HTTP ${status}`, type: "api_error" } }));
        return;
      }

      const isStream = Boolean(body.stream) || urlPath.includes("streamGenerateContent") || Array.isArray(spec.sse);
      if (isStream) {
        const events = spec.sse || this.defaultSse(urlPath, body);
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        for (let i = 0; i < events.length; i++) {
          if (spec.abortAfterChunks !== undefined && i >= spec.abortAfterChunks) {
            res.destroy();
            return;
          }
          const ev = events[i];
          if (typeof ev === "string") {
            res.write(`data: ${ev}\n\n`);
          } else if (ev.event) {
            res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify(ev)}\n\n`);
          }
        }
        if (urlPath.includes("/chat/completions")) {
          res.write("data: [DONE]\n\n");
        }
        res.end();
        return;
      }

      const payload = spec.json || this.defaultJson(urlPath, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  }

  private defaultJson(urlPath: string, body: Record<string, any>): Record<string, any> {
    const model = body.model || "gpt-4o";
    if (urlPath.includes("/messages")) {
      return {
        id: "msg_node_wire",
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: "Anthropic Node wire OK" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 24, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      };
    }
    if (urlPath.includes("/responses")) {
      return {
        id: "resp_node_wire",
        object: "response",
        created_at: 1763470000,
        status: "completed",
        model,
        output: [{ type: "message", id: "m1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Responses Node wire OK", annotations: [] }] }],
        usage: { input_tokens: 150, input_tokens_details: { cached_tokens: 64 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 180 },
      };
    }
    if (urlPath.includes(":generateContent")) {
      return {
        candidates: [{ content: { role: "model", parts: [{ text: "Gemini Node wire OK" }] }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 25, thoughtsTokenCount: 15, cachedContentTokenCount: 50, totalTokenCount: 240 },
      };
    }
    if (urlPath.includes("/api/chat")) {
      return { model, message: { role: "assistant", content: "Ollama Node wire OK" }, done: true, prompt_eval_count: 64, eval_count: 18 };
    }
    return {
      id: "chatcmpl_node_wire",
      object: "chat.completion",
      created: 1763470000,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: "OpenAI Node wire OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 110, completion_tokens: 20, total_tokens: 130 },
    };
  }

  private defaultSse(urlPath: string, body: Record<string, any>): any[] {
    const model = body.model || "gpt-4o";
    if (urlPath.includes("/messages")) {
      return [
        { event: "message_start", data: { type: "message_start", message: { id: "msg_s1", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 80, output_tokens: 1, cache_read_input_tokens: 400, cache_creation_input_tokens: 100 } } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello Claude SSE" } } },
        { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
        { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } } },
        { event: "message_stop", data: { type: "message_stop" } },
      ];
    }
    if (urlPath.includes("/responses")) {
      return [
        { event: "response.created", data: { type: "response.created", response: { id: "resp_s1", object: "response", status: "in_progress", model, output: [] } } },
        { event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "m1", output_index: 0, content_index: 0, delta: "Streamed response." } },
        { event: "response.completed", data: { type: "response.completed", response: { id: "resp_s1", object: "response", status: "completed", model, output: [{ type: "message", id: "m1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Streamed response.", annotations: [] }] }], usage: { input_tokens: 310, input_tokens_details: { cached_tokens: 128 }, output_tokens: 55, output_tokens_details: { reasoning_tokens: 20 }, total_tokens: 365 } } } },
      ];
    }
    if (urlPath.includes("streamGenerateContent")) {
      return [
        { candidates: [{ content: { role: "model", parts: [{ text: "Gemini stream OK" }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 180, candidatesTokenCount: 30, thoughtsTokenCount: 25, cachedContentTokenCount: 40, totalTokenCount: 235 } },
      ];
    }
    const chunks: any[] = [
      { id: "c1", object: "chat.completion.chunk", created: 1763470000, model, choices: [{ index: 0, delta: { role: "assistant", content: "Hello OpenAI SSE" }, finish_reason: "stop" }], usage: null },
    ];
    if (body.stream_options?.include_usage) {
      chunks.push({ id: "c1", object: "chat.completion.chunk", created: 1763470000, model, choices: [], usage: { prompt_tokens: 145, completion_tokens: 28, total_tokens: 173, prompt_tokens_details: { cached_tokens: 64 }, completion_tokens_details: { reasoning_tokens: 0 } } });
    }
    return chunks;
  }
}
