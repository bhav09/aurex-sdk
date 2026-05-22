"use client";

import { useState, useEffect } from "react";
import { 
    Upload, 
    Trash2, 
    CheckCircle2, 
    AlertCircle, 
    Download, 
    FileText, 
    Coins, 
    RefreshCw,
    KeyRound,
    Copy,
    Plus,
    Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { aurixAPI } from "@/lib/api-client";

interface PricingOverride {
    id: string;
    model_name: string;
    input_price_per_1m: number;
    output_price_per_1m: number;
}

interface SettingsPanelProps {
    companyName: string;
    onRefreshAnalysis: () => void;
}

export function SettingsPanel({ companyName, onRefreshAnalysis }: SettingsPanelProps) {
    const [overrides, setOverrides] = useState<PricingOverride[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const [keys, setKeys] = useState<any[]>([]);
    const [newKeyName, setNewKeyName] = useState("");
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [keyLoading, setKeyLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchOverrides = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await aurixAPI.getPricingOverrides(companyName);
            setOverrides(data);
        } catch (err: any) {
            console.error("Error fetching overrides:", err);
            setError(err.message || "Failed to load pricing overrides");
        } finally {
            setLoading(false);
        }
    };

    const fetchKeys = async () => {
        setKeyLoading(true);
        try {
            const data = await aurixAPI.listApiKeys();
            setKeys(data);
        } catch (err: any) {
            console.error("Error listing keys:", err);
        } finally {
            setKeyLoading(false);
        }
    };

    const handleGenerateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;
        setKeyLoading(true);
        try {
            const res = await aurixAPI.generateApiKey(newKeyName.trim(), companyName);
            setGeneratedKey(res.key);
            setNewKeyName("");
            await fetchKeys();
        } catch (err: any) {
            alert(err.message || "Failed to generate API Key");
        } finally {
            setKeyLoading(false);
        }
    };

    const handleRevokeKey = async (id: string) => {
        if (!confirm("Are you sure you want to revoke this API key? SDK integrations using this key will immediately fail.")) {
            return;
        }
        setKeyLoading(true);
        try {
            await aurixAPI.revokeApiKey(id);
            await fetchKeys();
        } catch (err: any) {
            alert(err.message || "Failed to revoke API Key");
        } finally {
            setKeyLoading(false);
        }
    };

    const handleCopyKey = () => {
        if (generatedKey) {
            navigator.clipboard.writeText(generatedKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        if (companyName) {
            fetchOverrides();
            fetchKeys();
        }
    }, [companyName]);

    const handleUpload = async (file: File) => {
        if (file.type !== "application/json" && !file.name.endsWith(".json")) {
            setError("Please upload a valid JSON file.");
            setSuccess(null);
            return;
        }

        setUploading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await aurixAPI.uploadPricingOverrides(file, companyName);
            setSuccess(`Successfully uploaded custom pricing! Loaded ${res.overrides_added} model overrides.`);
            await fetchOverrides();
            onRefreshAnalysis();
        } catch (err: any) {
            setError(err.message || "Failed to parse or upload pricing overrides JSON.");
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await handleUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await handleUpload(e.target.files[0]);
        }
    };

    const handleClearOverrides = async () => {
        if (!confirm("Are you sure you want to clear all custom pricing overrides? Global model pricing catalog defaults will be restored.")) {
            return;
        }

        setUploading(true);
        setError(null);
        setSuccess(null);

        try {
            // Send empty JSON blob to POST /pricing/overrides to clear all overrides
            const emptyBlob = new Blob([JSON.stringify({})], { type: "application/json" });
            const file = new File([emptyBlob], "clear.json", { type: "application/json" });
            
            await aurixAPI.uploadPricingOverrides(file, companyName);
            setSuccess("All custom pricing overrides cleared successfully.");
            await fetchOverrides();
            onRefreshAnalysis();
        } catch (err: any) {
            setError(err.message || "Failed to clear pricing overrides.");
        } finally {
            setUploading(false);
        }
    };

    const downloadSampleJSON = () => {
        const sample = {
            "gpt-4o": {
                "input": 2.50,
                "output": 10.00
            },
            "claude-3-5-sonnet": {
                "input": 3.00,
                "output": 15.00
            },
            "gemini-1.5-pro": {
                "input": 1.25,
                "output": 3.75
            }
        };

        const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "aurex_pricing_schema_template.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Coins className="h-7 w-7 text-violet-400" />
                    Pricing & Cost Settings
                </h2>
                <p className="text-sm text-white/50">
                    Configure custom model pricing overrides for <strong className="text-white">{companyName}</strong>. 
                    These prices take priority over standard public API prices during cost calculations.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Left Card: JSON Upload */}
                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-white text-lg">Upload Pricing JSON</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={downloadSampleJSON} 
                                className="h-8 gap-1.5 border-white/10 bg-white/5 text-xs text-white hover:bg-white/10"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Schema Template
                            </Button>
                        </div>
                        
                        <p className="text-xs text-white/50 leading-relaxed mb-4">
                            Upload a JSON file containing model cost overrides mapping model names to custom costs. 
                            Costs are specified per million (1,000,000) tokens. Supported format:
                        </p>

                        <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-[11px] leading-relaxed text-white/70 overflow-x-auto mb-4">
                            <pre>{`{
  "gpt-4o": {
    "input": 2.50,
    "output": 10.00
  },
  "claude-3-5-sonnet": {
    "input": 3.00,
    "output": 15.00
  }
}`}</pre>
                        </div>

                        {/* Drag and Drop Zone */}
                        <div 
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            className={`border border-dashed rounded-xl px-6 py-8 text-center transition-all ${
                                dragActive 
                                ? "border-violet-500 bg-violet-500/10" 
                                : "border-white/10 hover:border-white/20 bg-white/[0.01]"
                            }`}
                        >
                            <input 
                                type="file" 
                                id="pricing-json-file" 
                                accept=".json" 
                                className="hidden" 
                                onChange={handleFileChange}
                            />
                            <label 
                                htmlFor="pricing-json-file" 
                                className="cursor-pointer flex flex-col items-center justify-center gap-2"
                            >
                                <div className="h-10 w-10 rounded-full bg-violet-500/10 flex items-center justify-center mb-1 text-violet-400">
                                    <Upload className="h-5 w-5" />
                                </div>
                                <span className="text-xs font-medium text-white">
                                    Drag & drop or select JSON file
                                </span>
                                <span className="text-[10px] text-white/40">
                                    Accepted formats: JSON (max. 10MB)
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        {error && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 flex items-start gap-2.5">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                                <span className="text-xs text-red-200/95 leading-normal">{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 flex items-start gap-2.5">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                                <span className="text-xs text-emerald-200/95 leading-normal">{success}</span>
                            </div>
                        )}

                        {uploading && (
                            <div className="flex items-center gap-2 text-xs text-white/50 justify-center">
                                <RefreshCw className="h-4 w-4 animate-spin text-violet-400" />
                                <span>Uploading & recalculating audit spend...</span>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Right Card: Table of active pricing overrides */}
                <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                                <Coins className="h-4 w-4 text-violet-400" />
                                Active Overrides
                            </h3>
                            {overrides.length > 0 && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={handleClearOverrides}
                                    className="h-8 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Clear All
                                </Button>
                            )}
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-xs text-white/40 flex flex-col items-center gap-2">
                                <RefreshCw className="h-6 w-6 animate-spin text-violet-400" />
                                <span>Loading overrides...</span>
                            </div>
                        ) : overrides.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-black/20 p-8 text-center space-y-3">
                                <FileText className="h-8 w-8 text-white/20 mx-auto" />
                                <p className="text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto">
                                    No custom pricing overrides configured for this company. Public prices apply.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-white/15 bg-black/20 max-h-[280px] overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-white/10 bg-white/5 hover:bg-transparent">
                                            <TableHead className="text-white/60 text-xs font-semibold">Model Name</TableHead>
                                            <TableHead className="text-right text-white/60 text-xs font-semibold">Input / 1M</TableHead>
                                            <TableHead className="text-right text-white/60 text-xs font-semibold">Output / 1M</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {overrides.map((override) => (
                                            <TableRow key={override.id} className="border-white/5 hover:bg-white/[0.02]">
                                                <TableCell className="font-mono text-xs text-white/80 py-2.5 truncate max-w-[140px]" title={override.model_name}>
                                                    {override.model_name}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-emerald-400 py-2.5">
                                                    ${override.input_price_per_1m.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-emerald-400 py-2.5">
                                                    ${override.output_price_per_1m.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 rounded-xl border border-white/15 bg-white/[0.02] p-4 text-[11px] leading-relaxed text-white/45">
                        <strong className="text-white">Note:</strong> Costs are automatically calculated in real-time. Changing model pricing overrides will immediately flag different inefficiencies and suggest model alternatives in your audit overview.
                    </div>
                </Card>
            </div>

            <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur-md mt-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/10 pb-4 mb-6">
                    <div className="space-y-1">
                        <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-violet-400" />
                            Aurex SDK API Keys
                        </h3>
                        <p className="text-xs text-white/50">
                            Create and manage API keys to authenticate Node.js and Python SDK integrations.
                        </p>
                    </div>
                </div>

                {generatedKey && (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 mb-6 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-violet-300">Copy your API Key</span>
                            <span className="text-[10px] text-violet-400">Save this somewhere safe - you won't be able to see it again!</span>
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2.5 border border-white/5 font-mono text-xs text-white">
                            <span className="flex-1 select-all break-all">{generatedKey}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCopyKey}
                                className="h-8 w-8 p-0 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                    {/* Key Creation Form */}
                    <div className="md:col-span-1 space-y-4">
                        <h4 className="font-medium text-white text-sm">Create New Key</h4>
                        <form onSubmit={handleGenerateKey} className="space-y-3">
                            <input
                                type="text"
                                placeholder="Key description (e.g. Production Backend)"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                            />
                            <Button
                                type="submit"
                                disabled={keyLoading || !newKeyName.trim()}
                                className="w-full h-9 bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white shadow-lg hover:shadow-violet-600/20 transition-all flex items-center justify-center gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                Generate Key
                            </Button>
                        </form>
                    </div>

                    {/* Keys Table */}
                    <div className="md:col-span-2 space-y-4">
                        <h4 className="font-medium text-white text-sm">Active API Keys</h4>
                        {keyLoading && keys.length === 0 ? (
                            <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center gap-2">
                                <RefreshCw className="h-6 w-6 animate-spin text-violet-400" />
                                <span>Loading keys...</span>
                            </div>
                        ) : keys.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-black/20 p-8 text-center space-y-2">
                                <KeyRound className="h-8 w-8 text-white/20 mx-auto" />
                                <p className="text-xs text-white/50">No API keys created yet.</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-white/15 bg-black/20 max-h-[280px] overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-white/10 bg-white/5 hover:bg-transparent">
                                            <TableHead className="text-white/60 text-xs font-semibold">Name</TableHead>
                                            <TableHead className="text-white/60 text-xs font-semibold">Prefix</TableHead>
                                            <TableHead className="text-white/60 text-xs font-semibold">Created At</TableHead>
                                            <TableHead className="text-right text-white/60 text-xs font-semibold">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {keys.map((k) => (
                                            <TableRow key={k.id} className="border-white/5 hover:bg-white/[0.02]">
                                                <TableCell className="text-xs text-white/80 py-2.5 font-medium">{k.name}</TableCell>
                                                <TableCell className="font-mono text-xs text-violet-400 py-2.5">{k.prefix}...</TableCell>
                                                <TableCell className="text-xs text-white/50 py-2.5">
                                                    {new Date(k.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRevokeKey(k.id)}
                                                        className="h-7 text-[10px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    >
                                                        Revoke
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
