"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, FileText, CheckCircle2, Download, BarChart3 } from "lucide-react";

const analysisSteps = [
  "Validating file format...",
  "Parsing data structure...",
  "Detecting duplicate prompts...",
  "Analyzing token usage patterns...",
  "Identifying cost inefficiencies...",
  "Checking for burst patterns...",
  "Evaluating model selection...",
  "Calculating optimization potential...",
  "Generating recommendations...",
  "Finalizing report..."
];

export function HowItWorksSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const sectionRef = useRef<HTMLDivElement>(null);

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

  const validateFile = (file: File): boolean => {
    const validTypes = ['text/csv', 'application/json', 'text/json'];
    const validExtensions = ['.csv', '.json'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(fileExtension) && !validTypes.includes(file.type)) {
      setFileError("Please upload a CSV or JSON file only");
      return false;
    }

    if (file.size > 50 * 1024 * 1024) {
      setFileError("File size must be less than 50MB");
      return false;
    }

    setFileError("");
    return true;
  };

  const simulateAnalysis = (file: File) => {
    setFileName(file.name);
    setIsProcessing(true);
    setIsComplete(false);
    setUploadProgress(0);
    setCurrentStep(0);

    const totalSteps = analysisSteps.length;
    const stepDuration = 400;

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= totalSteps) {
          clearInterval(interval);
          setUploadProgress(100);
          setTimeout(() => {
            setIsComplete(true);
          }, 500);
          return prev;
        }
        setUploadProgress(Math.round((next / totalSteps) * 100));
        return next;
      });
    }, stepDuration);
  };

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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        simulateAnalysis(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        simulateAnalysis(file);
      }
    }
  };

  const handleDownload = () => {
    // Simulate download
    console.log("Downloading report...");
  };

  const handleVisualize = () => {
    // Simulate visualization
    console.log("Opening visualization...");
  };

  const resetUpload = () => {
    setIsProcessing(false);
    setIsComplete(false);
    setUploadProgress(0);
    setCurrentStep(0);
    setFileName("");
    setFileError("");
  };

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-[oklch(0.09_0.01_260)] text-white overflow-hidden"
    >
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="relative mb-16 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Title column */}
          <div className="overflow-hidden">
            <div className={`transition-all duration-1000 ${isVisible ? "translate-x-0 opacity-100" : "-translate-x-12 opacity-0"}`}>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-8">
                <span className="w-12 h-px bg-white/20" />
                How It Works
              </span>
            </div>

            <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.85] transition-all duration-1000 delay-100 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"}`}>
              <span className="block">Upload.</span>
              <span className="block text-white/30">Analyze.</span>
              <span className="block text-white/10">Optimize.</span>
            </h2>
          </div>

          {/* Upload Zone */}
          <div className={`transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative p-8 border-2 border-dashed transition-all duration-300 ${isDragging
                  ? "border-[#eca8d6] bg-[#eca8d6]/5"
                  : "border-white/20 bg-black/40 hover:border-white/30"
                }`}
            >
              <input
                type="file"
                id="file-upload"
                accept=".csv,.json"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!isProcessing && !isComplete ? (
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <div className="flex flex-col items-center justify-center py-8">
                    <Upload className="w-12 h-12 text-white/60 mb-4" />
                    <h3 className="text-xl font-display mb-2">
                      Drop your file here
                    </h3>
                    <p className="text-white/60 mb-4 text-center text-sm">
                      CSV or JSON files only
                    </p>
                    <button
                      type="button"
                      className="px-6 py-2 bg-white text-black font-medium hover:bg-white/90 transition-colors text-sm"
                    >
                      Browse Files
                    </button>
                    <p className="text-xs text-white/40 mt-3">
                      Max file size: 50MB
                    </p>
                    {fileError && (
                      <p className="text-xs text-red-400 mt-2">{fileError}</p>
                    )}
                  </div>
                </label>
              ) : isProcessing ? (
                <div className="py-8">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="w-12 h-12 text-[#eca8d6] mb-4 animate-pulse" />
                    <h3 className="text-xl font-display mb-2">
                      Analyzing {fileName}
                    </h3>
                    <div className="w-full max-w-md mb-4">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-[#eca8d6] transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-center text-white/60 text-sm">
                        {uploadProgress}% complete
                      </p>
                    </div>
                    <div className="w-full max-w-md space-y-2">
                      {analysisSteps.map((step, index) => (
                        <div
                          key={index}
                          className={`text-xs transition-all duration-300 ${index < currentStep
                              ? "text-green-400"
                              : index === currentStep
                                ? "text-[#eca8d6] font-medium"
                                : "text-white/30"
                            }`}
                        >
                          {index < currentStep ? "✓ " : index === currentStep ? "→ " : "○ "}
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <div className="flex flex-col items-center justify-center">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mb-4" />
                    <h3 className="text-xl font-display mb-2">
                      Analysis Complete!
                    </h3>
                    <p className="text-white/60 mb-6 text-center text-sm">
                      Your optimization report is ready
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-6 py-2 bg-white text-black font-medium hover:bg-white/90 transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download Report
                      </button>
                      <button
                        type="button"
                        onClick={handleVisualize}
                        className="flex items-center gap-2 px-6 py-2 border border-white/30 text-white font-medium hover:bg-white/10 transition-colors text-sm"
                      >
                        <BarChart3 className="w-4 h-4" />
                        Visualize
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="mt-4 text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      Upload another file
                    </button>
                  </div>
                </div>
              )}

              {/* Privacy badge */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 bg-black/60 border border-white/10 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-xs font-mono">100% Local Processing</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supported integrations */}
        <div className={`mt-12 transition-all duration-1000 delay-300 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <p className="text-sm text-white/40 mb-4 text-center">
            Works with exports from:
          </p>
          <div className="flex flex-wrap justify-center gap-4 items-center">
            {["LangSmith", "Helicone", "OpenAI", "Custom JSON"].map((integration) => (
              <div
                key={integration}
                className="px-4 py-2 border border-white/20 bg-black/40 text-sm font-mono"
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

// Made with Bob
