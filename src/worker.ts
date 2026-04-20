import Papa, { type ParseError } from "papaparse";
import { AuditTracker, recordToUsageRow, type AuditResult, type SemanticCluster } from "./audit";
import { resolveHeaderMap, unionHeaderKeys } from "./columns";
import EmbeddingWorker from "./embedding-worker?worker";

export type WorkerMessage =
  | { type: "progress"; rowsProcessed: number | string }
  | { type: "success"; audit: any; warnings: string[] }
  | { type: "error"; message: string };

self.onmessage = async (e) => {
  const { file, revenueUSD } = e.data;
  
  if (!(file instanceof File)) {
    self.postMessage({ type: "error", message: "Invalid file object received." });
    return;
  }

  const tracker = new AuditTracker(revenueUSD);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (ext === "json") {
      // For JSON, we still read the whole file, since chunking a large JSON array
      // requires a specialized library like oboe.js. This is acceptable for MVP,
      // as most heavy log exports are CSVs.
      const text = await file.text();
      let data = JSON.parse(text) as any;
      if (!Array.isArray(data)) {
        if (data && typeof data === "object") {
          if (Array.isArray(data.data)) data = data.data;
          else if (Array.isArray(data.rows)) data = data.rows;
          else if (Array.isArray(data.items)) data = data.items;
        }
      }
      if (!Array.isArray(data)) {
        throw new Error("JSON must be an array of objects or { data: [...] }.");
      }
      
      const records = data as Record<string, unknown>[];
      if (records.length === 0) {
        tracker.warnings.push("No rows found in JSON.");
      } else {
        const headers = unionHeaderKeys(records);
        const map = resolveHeaderMap(headers);
        
        if (!map) {
          tracker.warnings.push("Could not detect required columns (need timestamp + model).");
        } else {
          if (!map.prompt) {
            tracker.warnings.push("No prompt/message column found — redundancy analysis may be limited.");
          }
          const headerNorms = new Set(headers.map((h) => h.trim().toLowerCase()));
          
          let count = 0;
          for (const rec of records) {
            const row = recordToUsageRow(rec, map, headerNorms);
            if (row) tracker.addUsageRow(row);
            
            count++;
            if (count % 5000 === 0) {
              self.postMessage({ type: "progress", rowsProcessed: count });
            }
          }
        }
      }

      const auditResult = tracker.finalize();
      await computeSemanticClusters(auditResult);
      self.postMessage({ type: "success", audit: auditResult, warnings: tracker.warnings });
      
    } else {
      // Stream CSV with PapaParse
      let isFirstChunk = true;
      let map: ReturnType<typeof resolveHeaderMap> | null = null;
      let headerNorms: Set<string>;
      let rowsProcessed = 0;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        chunkSize: 1024 * 1024 * 2, // 2MB chunks
        chunk: (results, parser) => {
          if (results.errors.length) {
            const fatal = results.errors.find(
              (err: ParseError) => err.type === "Quotes" || err.type === "FieldMismatch"
            );
            if (fatal) {
              parser.abort();
              self.postMessage({ type: "error", message: `CSV parse: ${fatal.message}` });
              return;
            }
          }

          const chunkRecords = results.data as Record<string, unknown>[];
          if (chunkRecords.length === 0) return;

          if (isFirstChunk) {
            isFirstChunk = false;
            // Sniff headers from the first chunk
            const headers = unionHeaderKeys(chunkRecords);
            map = resolveHeaderMap(headers);
            
            if (!map) {
              parser.abort();
              self.postMessage({ type: "error", message: "Could not detect required columns (need timestamp + model)." });
              return;
            }
            if (!map.prompt) {
              tracker.warnings.push("No prompt/message column found — redundancy analysis may be limited.");
            }
            headerNorms = new Set(headers.map((h) => h.trim().toLowerCase()));
          }

          if (!map) return;

          for (const rec of chunkRecords) {
            const row = recordToUsageRow(rec, map, headerNorms);
            if (row) tracker.addUsageRow(row);
          }

          rowsProcessed += chunkRecords.length;
          self.postMessage({ type: "progress", rowsProcessed });
        },
        complete: () => {
          if (isFirstChunk) {
            tracker.warnings.push("No rows found in CSV.");
          }
          const auditResult = tracker.finalize();
          computeSemanticClusters(auditResult).then(() => {
            self.postMessage({ type: "success", audit: auditResult, warnings: tracker.warnings });
          }).catch(err => {
            self.postMessage({ type: "error", message: err.message });
          });
        },
        error: (err) => {
          self.postMessage({ type: "error", message: `CSV parse: ${err.message}` });
        }
      });
    }
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

