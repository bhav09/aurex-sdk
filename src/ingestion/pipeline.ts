import Papa from "papaparse";
import { CanonicalEvent } from "./contracts";
import { normalizers, NormalizerContext, Normalizer } from "./normalizers";
import { UserMappedCsvNormalizer, UserColumnMapping } from "./normalizers/user_mapped_csv";

export interface PipelineOptions {
  onProgress(rowsProcessed: number): void;
  onEvent(event: CanonicalEvent): void;
  onWarning(message: string): void;
  onError(message: string): void;
  onComplete(): void;
  userMapping?: UserColumnMapping;
}

export function runIngestionPipeline(file: File, options: PipelineOptions): void {
  const ctx: NormalizerContext = {
    onEvent: options.onEvent,
    onWarning: options.onWarning,
  };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "json") {
    file.text().then(text => {
      let data = JSON.parse(text);
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
        options.onWarning("No rows found in JSON.");
        options.onComplete();
        return;
      }
      
      const headers = Object.keys(records[0] || {});
      const normalizer = selectNormalizer(headers, records);
      if (!normalizer) {
        options.onError("No suitable normalizer found for this format.");
        return;
      }

      let count = 0;
      for (const rec of records) {
        normalizer.normalize(rec, ctx);
        count++;
        if (count % 5000 === 0) {
          options.onProgress(count);
        }
      }
      
      options.onComplete();
    }).catch(err => {
      options.onError(err instanceof Error ? err.message : String(err));
    });
    return;
  }

  // CSV
  let isFirstChunk = true;
  let normalizer: Normalizer | null = null;
  let rowsProcessed = 0;
  
  // Custom parsing options for CloudWatch / Bedrock which has header rows
  let skipRows = 0;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    chunkSize: 1024 * 1024 * 2, // 2MB chunks
    chunk: (results, parser) => {
      if (results.errors.length) {
        const fatal = results.errors.find(
          (err: any) => err.type === "Quotes" || err.type === "FieldMismatch"
        );
        if (fatal) {
          parser.abort();
          options.onError(`CSV parse: ${fatal.message}`);
          return;
        }
      }

      const chunkRecords = results.data as Record<string, unknown>[];
      if (chunkRecords.length === 0) return;

      if (isFirstChunk) {
        isFirstChunk = false;
        
        // Bedrock Cloudwatch check
        const firstLineVals = Object.values(chunkRecords[0] || {});
        if (firstLineVals.some(v => String(v).includes("AWS/Bedrock"))) {
          // CloudWatch has ~5 rows of meta headers. In a real stream, this is tricky to skip properly 
          // mid-Papa-parse. We'll rely on the Bedrock normalizer skipping bad rows.
        }

        const headers = results.meta.fields || Object.keys(chunkRecords[0] || {});
        
        if (options.userMapping) {
          normalizer = new UserMappedCsvNormalizer(options.userMapping);
        } else {
          normalizer = selectNormalizer(headers, chunkRecords);
        }
        
        if (!normalizer) {
          parser.abort();
          options.onError("No suitable normalizer found for this CSV format.");
          return;
        }
      }

      if (!normalizer) return;

      for (const rec of chunkRecords) {
        normalizer.normalize(rec, ctx);
      }

      rowsProcessed += chunkRecords.length;
      options.onProgress(rowsProcessed);
    },
    complete: () => {
      if (isFirstChunk) {
        options.onWarning("No rows found in CSV.");
      }
      options.onComplete();
    },
    error: (err: Error) => {
      options.onError(`CSV parse: ${err.message}`);
    }
  });
}

export function selectNormalizer(headers: string[], firstRows: Record<string, unknown>[] = []): Normalizer | null {
  for (const norm of normalizers) {
    if (norm.canHandle(headers, firstRows)) {
      return norm;
    }
  }
  // Fallback
  return null;
}
