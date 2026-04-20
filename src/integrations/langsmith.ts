export async function fetchLangSmithLogs(apiKey: string, project: string = "default"): Promise<File> {
  const url = `https://api.smith.langchain.com/api/v1/runs?project_name=${encodeURIComponent(project)}&run_type=llm&limit=10000`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`LangSmith API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const runs = data.runs || data;
  
  const mapped = runs.map((r: any) => {
    return {
      timestamp: r.start_time,
      model: r.extra?.invocation_params?.model || r.extra?.invocation_params?.model_name || "unknown",
      prompt: JSON.stringify(r.inputs),
      input_tokens: r.prompt_tokens || r.tokens_usage?.prompt_tokens || 0,
      output_tokens: r.completion_tokens || r.tokens_usage?.completion_tokens || 0,
      request_id: r.id,
    };
  });

  const blob = new Blob([JSON.stringify(mapped)], { type: "application/json" });
  return new File([blob], "langsmith-logs.json", { type: "application/json" });
}
