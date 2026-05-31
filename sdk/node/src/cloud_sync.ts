export async function syncBatchWithRetry(
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const maxRetries = opts.maxRetries ?? 3;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get("Retry-After") || "1");
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000);
        continue;
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < maxRetries) {
          await sleep((2 ** attempt) * 1000 + Math.random() * 500);
          lastError = `HTTP ${response.status}`;
          continue;
        }
        return { ok: false, error: `HTTP ${response.status}` };
      }

      return { ok: true };
    } catch (err: any) {
      lastError = err?.message || String(err);
      if (attempt < maxRetries) {
        await sleep((2 ** attempt) * 1000 + Math.random() * 500);
        continue;
      }
    }
  }

  return { ok: false, error: lastError };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
