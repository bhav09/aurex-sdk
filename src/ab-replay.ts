export async function fetchCheaperModel(prompt: string, apiKey: string, model: string = "gpt-4o-mini"): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const body = JSON.stringify({
    model,
    messages: [
      { role: "user", content: prompt }
    ],
    max_tokens: 1024,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Model API error: ${res.status} ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No output returned.";
}
