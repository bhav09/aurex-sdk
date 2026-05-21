export function extractProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("dall-e") || m.includes("text-embedding") || m.includes("tts-") || m.includes("whisper")) {
    return "openai";
  }
  if (m.includes("claude")) {
    return "anthropic";
  }
  if (m.includes("gemini") || m.includes("bison") || m.includes("gecko") || m.includes("palm")) {
    return "google";
  }
  if (m.includes("llama") || m.includes("mistral") || m.includes("mixtral") || m.includes("cohere")) {
    return "openrouter"; // Defaulting generic open weights
  }
  return "unknown";
}
