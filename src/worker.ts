import Papa, { type ParseError } from "papaparse";
import { AuditTracker, type UsageRow, type AuditResult, type SemanticCluster } from "./audit";
import EmbeddingWorker from "./embedding-worker?worker";
import { runIngestionPipeline } from "./ingestion/pipeline";
import { CanonicalEvent } from "./ingestion/contracts";

export type WorkerMessage =
  | { type: "progress"; rowsProcessed: number | string }
  | { type: "success"; audit: any; warnings: string[] }
  | { type: "error"; message: string };

self.onmessage = async (e) => {
  const { file, revenueUSD, userMapping } = e.data;
  
  if (!(file instanceof File)) {
    self.postMessage({ type: "error", message: "Invalid file object received." });
    return;
  }

  const tracker = new AuditTracker(revenueUSD);
  
  try {
    runIngestionPipeline(file, {
      userMapping,
      onProgress: (rowsProcessed) => {
        self.postMessage({ type: "progress", rowsProcessed });
      },
      onEvent: (event: CanonicalEvent) => {
        // Map CanonicalEvent to UsageRow for current AuditTracker
        const row: UsageRow = {
          timestamp: event.timestamp,
          model: event.model,
          prompt: event.prompt,
          promptNorm: event.prompt ? event.prompt.replace(/\s+/g, " ").trim().toLowerCase() : undefined,
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          requestId: event.request_id,
        };
        tracker.addUsageRow(row);
      },
      onWarning: (message) => {
        tracker.warnings.push(message);
      },
      onError: (message) => {
        self.postMessage({ type: "error", message });
      },
      onComplete: () => {
        const auditResult = tracker.finalize();
        computeSemanticClusters(auditResult).then(() => {
          self.postMessage({ type: "success", audit: auditResult, warnings: tracker.warnings });
        }).catch(err => {
          self.postMessage({ type: "error", message: err.message });
        });
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", message: msg });
  }
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function computeSemanticClusters(audit: AuditResult): Promise<void> {
  const topDups = audit.duplicates.slice(0, 150);
  if (topDups.length < 2) return;
  
  self.postMessage({ type: "progress", rowsProcessed: "Loading semantic model..." });
  const worker = new EmbeddingWorker();
  
  try {
    const embeddings = await new Promise<number[][]>((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === "progress") {
           if (e.data.data && e.data.data.status === "downloading") {
             self.postMessage({ type: "progress", rowsProcessed: `Downloading semantic model: ${Math.round(e.data.data.progress || 0)}%` });
           } else if (e.data.data && e.data.data.status === "ready") {
             self.postMessage({ type: "progress", rowsProcessed: "Computing embeddings..." });
           }
        }
        else if (e.data.type === "embedded") resolve(e.data.embeddings);
        else if (e.data.type === "error") reject(new Error(e.data.message));
      };
      worker.postMessage({ type: "embed", prompts: topDups.map(d => d.promptPreview) });
    });
    
    const clusters: SemanticCluster[] = [];
    const visited = new Set<number>();
    
    for (let i = 0; i < embeddings.length; i++) {
      if (visited.has(i)) continue;
      visited.add(i);
      
      let clusterCount = topDups[i].count;
      let clusterWaste = topDups[i].wastedInputTokens;
      const clusterModels = new Set(topDups[i].models);
      
      let matches = 0;
      for (let j = i + 1; j < embeddings.length; j++) {
        if (visited.has(j)) continue;
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim > 0.85) {
          visited.add(j);
          matches++;
          clusterCount += topDups[j].count;
          clusterWaste += topDups[j].wastedInputTokens;
          for (const m of topDups[j].models) clusterModels.add(m);
        }
      }
      
      if (matches > 0) {
        clusters.push({
          clusterPreview: topDups[i].promptPreview,
          count: clusterCount,
          wastedInputTokens: clusterWaste,
          models: Array.from(clusterModels),
        });
      }
    }
    audit.semanticClusters = clusters.sort((a, b) => b.count - a.count);
  } catch (e: any) {
    // If embedding fails (e.g. WASM not supported), gracefully continue
    console.warn("Semantic clustering failed:", e.message);
  } finally {
    worker.terminate();
  }
}

