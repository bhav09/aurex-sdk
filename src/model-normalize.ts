export type PriceKey = {
  inputPerMillion: number;
  outputPerMillion: number;
};

/** Normalize model id for matching (OpenAI, Vertex, gateway prefixes). */
export function canonModel(m: string): string {
  return m
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)/, "");
}
