import { AnthropicCsvNormalizer } from "./anthropic_csv";
import { BedrockCsvNormalizer } from "./bedrock_csv";
import { OpenAiCsvNormalizer } from "./openai_csv";

export const normalizers = [
  new AnthropicCsvNormalizer(),
  new BedrockCsvNormalizer(),
  new OpenAiCsvNormalizer()
];

export * from "./base";
export * from "./anthropic_csv";
export * from "./bedrock_csv";
export * from "./openai_csv";
