import React, { useCallback, useState } from "react";
import { UploadCloud, File, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
}

export function FileUpload({ onFileSelect, accept = ".csv", disabled = false }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.endsWith(accept.replace(".", ""))) {
          setSelectedFile(file);
          onFileSelect(file);
        }
      }
    },
    [accept, disabled, onFileSelect]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [disabled, onFileSelect]
  );

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
  };

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-10 border-2 border-dashed rounded-2xl transition-colors duration-200 ease-in-out cursor-pointer bg-background",
        isDragging ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20 hover:border-primary/30",
        disabled && "opacity-50 cursor-not-allowed",
        selectedFile && "border-green-500/50 bg-green-500/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById("file-upload")?.click()}
    >
      <input
        id="file-upload"
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {selectedFile ? (
        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex items-center gap-2 text-center">
            <File className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{selectedFile.name}</span>
            <button
              onClick={clearFile}
              className="p-1 rounded-full hover:bg-muted-foreground/20 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
            <UploadCloud className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              CSV files only (max 10MB)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
