"use client";

import { useCallback, useState, useEffect } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { aurexAPI } from "@/lib/api-client";
import { DataExportGuide } from "@/components/audit/data-export-guide";

interface UploadZoneProps {
    onFileSelect: (file: File, userInfo: { user_name: string; email: string; company_name: string }) => void;
    initialFile?: File | null;
    onResetPending?: () => void;
}

export function UploadZone({ 
    onFileSelect,
    initialFile = null,
    onResetPending
}: UploadZoneProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const validateFile = (file: File): boolean => {
        const validExtensions = ['.csv', '.json', '.jsonl'];
        const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        const maxSize = 100 * 1024 * 1024; // 100MB

        if (!validExtensions.includes(fileExtension)) {
            setError('Accepted file types: CSV, JSON, JSONL');
            return false;
        }

        if (file.size > maxSize) {
            setError('File size must be less than 100MB');
            return false;
        }

        setError(null);
        return true;
    };

    const handleFile = (file: File) => {
        if (validateFile(file)) {
            setSelectedFile(file);
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

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setError(null);
        // Reset file input
        const fileInput = document.getElementById('file-upload-audit') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedFile) {
            setError("Please select a file to upload");
            return;
        }

        // Generate a random ID for anonymous analysis
        const tempId = Math.random().toString(36).substring(7);
        onFileSelect(selectedFile, {
            user_name: `User-${tempId}`,
            email: `anon-${tempId}@local.audit`,
            company_name: "Local Audit"
        });
        setSelectedFile(null);
    };

    const handleCancel = () => {
        setSelectedFile(null);
        setError(null);
        if (onResetPending) {
            onResetPending();
        }
    };

    return (
        <div className="sm:mx-auto sm:max-w-lg flex items-center justify-center p-10 w-full max-w-lg">
            <form onSubmit={handleSubmit} className="w-full">
                <div className="text-center mb-8">
                    <h3 className="text-2xl font-display text-white mb-2">Drop your OpenAI/Anthropic logs here</h3>
                    <p className="text-sm text-emerald-400 flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" />
                        Runs entirely locally in your browser. Data never leaves your machine.
                    </p>
                </div>



                {/* File Upload Area */}
                <div className="mt-4 flex justify-end">
                    <DataExportGuide />
                </div>
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`mt-2 flex justify-center space-x-4 rounded-md border border-dashed border-input px-6 py-10 transition-colors ${isDragging ? 'border-primary bg-primary/5' : ''
                        }`}
                >
                    <div className="sm:flex sm:items-center sm:gap-x-3">
                        <Upload
                            className="mx-auto h-8 w-8 text-muted-foreground sm:mx-0 sm:h-6 sm:w-6"
                            aria-hidden={true}
                        />
                        <div className="mt-4 flex text-sm leading-6 text-foreground sm:mt-0">
                            <Label
                                htmlFor="file-upload-audit"
                                className="relative cursor-pointer rounded-sm pl-1 font-medium text-primary hover:underline hover:underline-offset-4"
                            >
                                <span>Drag and drop or choose file to upload</span>
                                <input
                                    id="file-upload-audit"
                                    name="file-upload-audit"
                                    type="file"
                                    accept=".csv,.json,.xlsx,.xls"
                                    className="sr-only"
                                    onChange={handleFileInput}
                                />
                            </Label>
                        </div>
                    </div>
                </div>

                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                    <p className="flex items-center justify-between">
                        Recommended max. size: 100 MB, Accepted file types: CSV, JSON.
                    </p>
                    <p className="mt-1">
                        <strong>Note:</strong> Ensure your file contains LLM usage data with columns for <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground">timestamp</code>, <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground">model</code>, and token counts (e.g., <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground">input_tokens</code> / <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground">output_tokens</code>).
                    </p>
                </div>

                {error && (
                    <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Selected File Display */}
                {selectedFile && (
                    <div className="relative mt-8 rounded-lg bg-muted p-3">
                        <div className="absolute right-1 top-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleRemoveFile}
                                className="rounded-sm p-2 text-muted-foreground hover:text-foreground"
                                aria-label="Remove"
                            >
                                <X className="size-4 shrink-0" aria-hidden={true} />
                            </Button>
                        </div>
                        <div className="flex items-center space-x-2.5">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background shadow-sm ring-1 ring-inset ring-input">
                                <FileSpreadsheet
                                    className="size-5 text-foreground"
                                    aria-hidden={true}
                                />
                            </span>
                            <div className="w-full">
                                <p className="text-xs font-medium text-foreground">
                                    {selectedFile.name}
                                </p>
                                <p className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                                    <span>{formatFileSize(selectedFile.size)}</span>
                                    <span>Ready to upload</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="mt-8 flex items-center justify-end space-x-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        className="whitespace-nowrap rounded-sm border border-input px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-foreground"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="default"
                        disabled={!selectedFile}
                        className="whitespace-nowrap rounded-sm bg-emerald-500 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Upload & Analyze
                    </Button>
                </div>
            </form>
        </div>
    );
}


