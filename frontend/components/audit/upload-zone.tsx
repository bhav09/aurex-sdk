"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
    onFileSelect: (file: File) => void;
}

export function UploadZone({ onFileSelect }: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const validateFile = (file: File): boolean => {
        const validTypes = ['text/csv', 'application/json', 'text/plain'];
        const maxSize = 50 * 1024 * 1024; // 50MB

        if (!validTypes.includes(file.type) && !file.name.match(/\.(csv|json)$/i)) {
            setError('Please upload a CSV or JSON file');
            return false;
        }

        if (file.size > maxSize) {
            setError('File size must be less than 50MB');
            return false;
        }

        setError(null);
        return true;
    };

    const handleFile = (file: File) => {
        if (validateFile(file)) {
            setSelectedFile(file);
            onFileSelect(file);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Upload Area */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ${isDragging
                        ? 'border-primary bg-primary/5 scale-[1.02]'
                        : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                    }`}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".csv,.json"
                    onChange={handleFileInput}
                />

                <div className="flex flex-col items-center gap-6 text-center">
                    {selectedFile ? (
                        <>
                            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-display mb-2">File Selected</h3>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <FileText className="w-4 h-4" />
                                    <span className="font-mono text-sm">{selectedFile.name}</span>
                                    <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <Upload className="w-8 h-8 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-xl font-display mb-2">
                                    Drop your usage logs here
                                </h3>
                                <p className="text-muted-foreground mb-4">
                                    or click to browse files
                                </p>
                                <label htmlFor="file-upload">
                                    <Button variant="outline" className="cursor-pointer" asChild>
                                        <span>Select File</span>
                                    </Button>
                                </label>
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 text-red-500 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Supported Formats */}
            <div className="mt-8">
                <p className="text-sm text-muted-foreground text-center mb-4">
                    Supported formats: CSV, JSON (max 50MB)
                </p>

                {/* Integration Logos */}
                <div className="flex items-center justify-center gap-8 opacity-60">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <span className="text-xs font-mono">LS</span>
                        </div>
                        <span className="text-xs text-muted-foreground">LangSmith</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <span className="text-xs font-mono">HC</span>
                        </div>
                        <span className="text-xs text-muted-foreground">Helicone</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <span className="text-xs font-mono">AI</span>
                        </div>
                        <span className="text-xs text-muted-foreground">OpenAI</span>
                    </div>
                </div>
            </div>

            {/* Privacy Notice */}
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-muted-foreground/10">
                <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                    </div>
                    <div className="text-sm">
                        <p className="font-medium mb-1">100% Local Processing</p>
                        <p className="text-muted-foreground text-xs">
                            Your data never leaves your device. All analysis happens locally in your browser.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Made with Bob
