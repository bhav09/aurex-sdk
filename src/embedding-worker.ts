import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";

// Disable local models
env.allowLocalModels = false;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
      progress_callback: (progress: any) => {
        self.postMessage({ type: "progress", data: progress });
      },
    });
  }
  return extractorPromise;
}

self.onmessage = async (e) => {
  const { type, prompts } = e.data;
  
  if (type === "embed") {
    try {
      const extractor = await getExtractor();
      const embeddings: number[][] = [];
      
      // Process in small batches
      for (const prompt of prompts) {
        const output = await extractor(prompt, { pooling: "mean", normalize: true });
        embeddings.push(Array.from(output.data));
      }
      
      self.postMessage({ type: "embedded", embeddings });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err.message });
    }
  }
};
