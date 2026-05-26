"use client";

import { useEffect, useState, useRef } from "react";
import { Upload, FileText, CheckCircle2 } from "lucide-react";

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    simulateUpload();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      simulateUpload();
    }
  };

  const simulateUpload = () => {
    setIsProcessing(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsProcessing(false);
            setUploadProgress(0);
          }, 1000);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <section id="demo" ref={sectionRef} className="relative py-32 lg:py-40 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-20">
          <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-8 transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"
            }`}>
            <span className="w-12 h-px bg-foreground/20" />
            Try It Now
          </span>

          <div className="grid lg:grid-cols-[auto_1fr] gap-8 lg:gap-16 items-stretch">
            {/* Image globe - left column, full height */}
            <div className={`w-48 lg:w-72 xl:w-80 shrink-0 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}>
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/world-3i68QNWJwmO7W19ztZWbevAwJQHzYL.png"
                alt="Global network sphere"
                className="w-full h-full object-contain object-center"
              />
            </div>

            {/* Title + description stacked */}
            <div className="flex flex-col justify-center">
              <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}>
                Upload &
                <br />
                <span className="text-muted-foreground">analyze.</span>
              </h2>

              <p className={`mt-8 text-xl text-muted-foreground leading-relaxed max-w-lg transition-all duration-1000 delay-100 ${isVisible ? "opacity-100" : "opacity-0"
                }`}>
                Drop your CSV or JSON file below to see instant analysis.
                All processing happens locally in your browser.
              </p>
            </div>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Large upload card */}
          <div className={`lg:col-span-2 relative transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative p-8 lg:p-12 border-2 border-dashed transition-all duration-300 ${isDragging
                  ? "border-[#eca8d6] bg-[#eca8d6]/5"
                  : "border-foreground/20 bg-foreground/[0.02] hover:border-foreground/30"
                }`}
            >
              <input
                type="file"
                id="file-upload"
                accept=".csv,.json"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!isProcessing ? (
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <div className="flex flex-col items-center justify-center py-12">
                    <Upload className="w-16 h-16 text-muted-foreground mb-6" />
                    <h3 className="text-2xl font-display mb-3">
                      Drop your file here
                    </h3>
                    <p className="text-muted-foreground mb-6 text-center max-w-md">
                      Supports CSV and JSON exports from LangSmith, Helicone, OpenAI, and more
                    </p>
                    <button
                      type="button"
                      className="px-6 py-3 bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
                    >
                      Browse Files
                    </button>
                    <p className="text-sm text-muted-foreground mt-4">
                      Max file size: 50MB
                    </p>
                  </div>
                </label>
              ) : (
                <div className="py-12">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="w-16 h-16 text-[#eca8d6] mb-6 animate-pulse" />
                    <h3 className="text-2xl font-display mb-3">
                      {uploadProgress < 100 ? "Processing..." : "Complete!"}
                    </h3>
                    <div className="w-full max-w-md">
                      <div className="h-2 bg-foreground/10 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-[#eca8d6] transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-center text-muted-foreground">
                        {uploadProgress < 100
                          ? `Analyzing ${uploadProgress}%...`
                          : "Analysis complete! Check your results below."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy badge */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-foreground/5 border border-foreground/10 rounded-full">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-mono">100% Local Processing</span>
              </div>
            </div>
          </div>

          {/* Stacked info cards */}
          <div className="flex flex-col gap-6">
            <div className={`p-8 border border-foreground/10 bg-foreground/[0.02] transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}>
              <div className="text-5xl mb-4">🔒</div>
              <h3 className="text-xl font-display mb-2">Private</h3>
              <p className="text-sm text-muted-foreground">
                Your data never leaves your browser. Zero uploads to our servers.
              </p>
            </div>

            <div className={`p-8 border border-foreground/10 bg-foreground/[0.02] transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}>
              <div className="text-5xl mb-4">⚡</div>
              <h3 className="text-xl font-display mb-2">Fast</h3>
              <p className="text-sm text-muted-foreground">
                Get insights in under 30 seconds. No waiting for server processing.
              </p>
            </div>
          </div>
        </div>

        {/* Supported integrations */}
        <div className={`mt-12 transition-all duration-1000 delay-300 ${isVisible ? "opacity-100" : "opacity-0"
          }`}>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            Works with exports from:
          </p>
          <div className="flex flex-wrap justify-center gap-6 items-center">
            {["LangSmith", "Helicone", "OpenAI", "Custom JSON"].map((integration) => (
              <div
                key={integration}
                className="px-4 py-2 border border-foreground/10 bg-foreground/[0.02] text-sm font-mono"
              >
                {integration}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


