"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { DataExpander } from "@/components/data-expander";
import { Markdown } from "@/components/ui/markdown";
import { processCSVFile, ProcessedDataSummary } from "@/lib/data-processor";
import { BrainCircuit, Loader2, Sparkles, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function CsvInsights() {
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelMessage, setModelMessage] = useState("");
  const [processingStatus, setProcessingStatus] = useState<"idle" | "parsing" | "generating" | "complete" | "error">("idle");
  const [dataSummary, setDataSummary] = useState<ProcessedDataSummary | null>(null);
  const [insights, setInsights] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('@/lib/worker.ts', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (event) => {
      const { status, message, output, data } = event.data;

      if (status === 'loading') {
        setModelStatus('loading');
        setModelMessage(message);
      } else if (status === 'progress') {
        // You could use `data` here to update a progress bar if desired
      } else if (status === 'ready') {
        setModelStatus('ready');
        setModelMessage(message);
      } else if (status === 'generating') {
        setProcessingStatus('generating');
        setInsights(""); // Clear previous insights
      } else if (status === 'update') {
        setInsights(output);
      } else if (status === 'complete') {
        setProcessingStatus('complete');
        setInsights(output);
      } else if (status === 'error') {
        if (modelStatus !== 'ready') {
          setModelStatus('error');
          setModelMessage(message);
        } else {
          setProcessingStatus('error');
          setErrorMsg(message);
        }
      }
    };

    // Trigger model load
    workerRef.current.postMessage({ type: 'load_model' });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      setProcessingStatus("parsing");
      setErrorMsg("");
      setInsights("");
      setDataSummary(null);

      const summary = await processCSVFile(file);
      setDataSummary(summary);

      // Generate prompt
      const prompt = `Based on the following processed data summary:
${JSON.stringify(summary, null, 2)}

Provide 3 bullet-point business insights and 2 concrete action items. Do not ask follow up questions. Format the output with clear headings.`;

      if (workerRef.current && modelStatus === "ready") {
        workerRef.current.postMessage({
          type: "generate",
          data: { prompt }
        });
      } else {
        setErrorMsg("Model is not ready yet. Please wait for it to download.");
        setProcessingStatus("error");
      }
    } catch (err: any) {
      setProcessingStatus("error");
      setErrorMsg(err?.message || "Failed to process CSV file");
    }
  }, [modelStatus]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 p-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight inline-flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          Client-Side CSV Insights
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Upload your data and let our local AI engine generate insights. 
          Everything runs entirely in your browser—no data ever leaves your machine.
        </p>

        {/* Model Status Indicator */}
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
          modelStatus === "loading" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          modelStatus === "ready" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          modelStatus === "error" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
          modelStatus === "idle" && "bg-muted text-muted-foreground"
        )}>
          {modelStatus === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
          {modelStatus === "ready" && <BrainCircuit className="w-4 h-4" />}
          {modelStatus === "error" && <AlertTriangle className="w-4 h-4" />}
          {modelStatus === "idle" && <BrainCircuit className="w-4 h-4" />}
          <span>{modelMessage || "Initializing AI Engine..."}</span>
        </div>
      </div>

      <div className="flex flex-col gap-8 mt-4">
        {/* Upload Zone */}
        <div className="order-last lg:order-first">
          <FileUpload 
            onFileSelect={handleFileSelect} 
            disabled={modelStatus !== "ready" || processingStatus === "parsing" || processingStatus === "generating"} 
          />
        </div>

        {/* Error Message */}
        {processingStatus === "error" && (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Loading State */}
        {processingStatus === "parsing" && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Parsing and analyzing CSV data locally...</p>
          </div>
        )}

        {/* Results Area */}
        {(processingStatus === "generating" || processingStatus === "complete") && dataSummary && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* AI Insights (Top Section) */}
            <div className="p-6 md:p-8 bg-card border rounded-xl shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">AI Business Insights</h2>
              </div>
              
              <div className="relative min-h-[150px]">
                <Markdown content={insights} />
                
                {processingStatus === "generating" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4 italic">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating insights...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Data Expander (Middle Section) */}
            <DataExpander summary={dataSummary} />
          </div>
        )}
      </div>
    </div>
  );
}
