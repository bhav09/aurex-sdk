export async function fetchHeliconeLogs(apiKey: string): Promise<File> {
  const url = "https://api.helicone.ai/v1/request/query";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: "all",
      limit: 10000,
    }),
  });

  if (!res.ok) {
    throw new Error(`Helicone API error: ${res.status} ${res.statusText}`);
  }

  const { data } = await res.json();
  const mapped = data.map((r: any) => ({
    timestamp: r.request_created_at,
    model: r.model || "unknown",
    prompt: typeof r.request_body === "object" ? JSON.stringify(r.request_body) : String(r.request_body),
    input_tokens: r.prompt_tokens || 0,
    output_tokens: r.completion_tokens || 0,
    request_id: r.request_id,
  }));

  const blob = new Blob([JSON.stringify(mapped)], { type: "application/json" });
  return new File([blob], "helicone-logs.json", { type: "application/json" });
}
