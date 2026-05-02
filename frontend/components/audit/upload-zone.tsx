"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface UploadZoneProps {
    onFileSelect: (file: File, userInfo: { user_name: string; email: string; company_name: string }) => void;
}

export function UploadZone({ onFileSelect }: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [email, setEmail] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [formErrors, setFormErrors] = useState<{
        userName?: string;
        email?: string;
        companyName?: string;
    }>({});

    const validateFile = (file: File): boolean => {
        const validExtensions = ['.csv', '.json', '.xlsx', '.xls'];
        const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validExtensions.includes(fileExtension)) {
            setError('Accepted file types: XLSX, XLS, CSV, JSON');
            return false;
        }

        if (file.size > maxSize) {
            setError('File size must be less than 10MB');
            return false;
        }

        setError(null);
        return true;
    };

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return false;
        }
        // Block Gmail addresses
        if (email.toLowerCase().includes('@gmail.com')) {
            return false;
        }
        return true;
    };

    const validateForm = (): boolean => {
        const errors: typeof formErrors = {};

        if (!userName.trim()) {
            errors.userName = "User name is required";
        }

        if (!email.trim()) {
            errors.email = "Email is required";
        } else if (!validateEmail(email)) {
            if (email.toLowerCase().includes('@gmail.com')) {
                errors.email = "Gmail addresses are not allowed";
            } else {
                errors.email = "Please enter a valid email address";
            }
        }

        if (!companyName.trim()) {
            errors.companyName = "Company name is required";
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedFile) {
            setError("Please select a file to upload");
            return;
        }

        if (!validateForm()) {
            return;
        }

        // All validations passed, proceed with upload
        onFileSelect(selectedFile, {
            user_name: userName,
            email: email,
            company_name: companyName
        });
    };

    const handleCancel = () => {
        setSelectedFile(null);
        setUserName("");
        setEmail("");
        setCompanyName("");
        setFormErrors({});
        setError(null);
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="sm:mx-auto sm:max-w-lg flex items-center justify-center p-10 w-full max-w-lg">
            <form onSubmit={handleSubmit} className="w-full">
                <h3 className="text-lg font-semibold text-foreground">File Upload</h3>

                {/* User Information Fields */}
                <div className="mt-4 space-y-4">
                    <div>
                        <Label htmlFor="user-name" className="text-sm font-medium">
                            User Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="user-name"
                            type="text"
                            value={userName}
                            onChange={(e) => {
                                setUserName(e.target.value);
                                if (formErrors.userName) {
                                    setFormErrors({ ...formErrors, userName: undefined });
                                }
                            }}
                            placeholder="Enter your name"
                            className={`mt-1 ${formErrors.userName ? 'border-red-500' : ''}`}
                            required
                        />
                        {formErrors.userName && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {formErrors.userName}
                            </p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="email" className="text-sm font-medium">
                            Email <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (formErrors.email) {
                                    setFormErrors({ ...formErrors, email: undefined });
                                }
                            }}
                            placeholder="your.email@company.com"
                            className={`mt-1 ${formErrors.email ? 'border-red-500' : ''}`}
                            required
                        />
                        {formErrors.email && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {formErrors.email}
                            </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                            Gmail addresses are not allowed
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="company-name" className="text-sm font-medium">
                            Company Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="company-name"
                            type="text"
                            value={companyName}
                            onChange={(e) => {
                                setCompanyName(e.target.value);
                                if (formErrors.companyName) {
                                    setFormErrors({ ...formErrors, companyName: undefined });
                                }
                            }}
                            placeholder="Enter your company name"
                            className={`mt-1 ${formErrors.companyName ? 'border-red-500' : ''}`}
                            required
                        />
                        {formErrors.companyName && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {formErrors.companyName}
                            </p>
                        )}
                    </div>
                </div>

                {/* File Upload Area */}
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`mt-4 flex justify-center space-x-4 rounded-md border border-dashed border-input px-6 py-10 transition-colors ${isDragging ? 'border-primary bg-primary/5' : ''
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

                <p className="mt-2 flex items-center justify-between text-xs leading-5 text-muted-foreground">
                    Recommended max. size: 10 MB, Accepted file types: XLSX, XLS, CSV, JSON.
                </p>

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
                        className="whitespace-nowrap rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Upload & Analyze
                    </Button>
                </div>
            </form>
        </div>
    );
}

// Made with Bob
