import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
    server: {
      deps: {
        external: ["openai", "@anthropic-ai/sdk", "@google/genai", "ollama", "@huggingface/inference"],
      },
    },
  },
});
