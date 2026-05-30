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
import { aurexAPI } from "@/lib/api-client";

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
    const [sdkCopyState, setSdkCopyState] = useState<Record<string, boolean>>({});

    const fetchOverrides = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await aurexAPI.getPricingOverrides(companyName);
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
            const data = await aurexAPI.listApiKeys();
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
            const res = await aurexAPI.generateApiKey(newKeyName.trim(), companyName);
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
            await aurexAPI.revokeApiKey(id);
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

    const copySdkSnippet = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setSdkCopyState(prev => ({ ...prev, [id]: true }));
        setTimeout(() => setSdkCopyState(prev => ({ ...prev, [id]: false })), 2000);
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
            const res = await aurexAPI.uploadPricingOverrides(file, companyName);
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
            const emptyBlob = new Blob([JSON.stringify({})], { type: "application/json" });
            const file = new File([emptyBlob], "clear.json", { type: "application/json" });

            await aurexAPI.uploadPricingOverrides(file, companyName);
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

    const pythonCode = `from aurex_sdk import AurexClient

client = AurexClient(
    api_key="your_api_key_here"
)

# Track LLM calls automatically
response = client.track_llm_call(
    model="gpt-4o",
    prompt_tokens=1500,
    completion_tokens=500,
    workflow_id="document_analysis"
)`;

    const nodeCode = `import { AurexClient } from '@aurex/sdk';

const client = new AurexClient({
  apiKey: 'your_api_key_here'
});

// Track LLM calls automatically
await client.trackLLMCall({
  model: 'gpt-4o',
  promptTokens: 1500,
  completionTokens: 500,
  workflowId: 'document_analysis'
});`;

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2 border-b border-white/5 pb-5">
                <h2 className="font-display text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Coins className="h-6 w-6 text-violet-400" />
                    System & Integration Settings
                </h2>
                <p className="text-xs text-white/40 font-mono">
                    Configure custom model pricing overrides and manage API keys for <strong className="text-white">{companyName}</strong>.
                </p>
            </div>

            {/* Pricing Overrides Info Banner */}
            <Card className="border-violet-500/20 bg-gradient-to-br from-[#0c0c0e]/90 to-[#141416]/50 p-5 backdrop-blur-md relative overflow-hidden rounded-xl">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-violet-400">
                        <Coins className="h-5 w-5" />
                    </div>
                    <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-white text-sm">Contract Pricing Model Overrides</h3>
                        <p className="text-xs text-white/60 leading-relaxed font-mono">
                            Enterprise customers often negotiate bespoke discounts with LLM providers. Upload your negotiated contract rates here to ensure Aurex calculates waste figures and savings metrics against your actual spend.
                        </p>
                    </div>
                </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Left Card: JSON Upload */}
                <Card className="border-white/[0.08] bg-[#0c0c0e]/85 p-6 backdrop-blur-md flex flex-col justify-between rounded-xl shadow-xl transition-all hover:border-white/10">
                    <div>
                        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50">Upload Custom Contract Pricing</h3>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={downloadSampleJSON}
                                className="h-7 gap-1 border-white/10 bg-white/5 text-[10px] font-mono text-white hover:bg-white/10 rounded-lg"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Template
                            </Button>
                        </div>

                        <p className="text-xs text-white/45 leading-relaxed font-mono mb-4">
                            Upload a JSON file containing model cost overrides. Rates are specified per million (1,000,000) tokens. Supported format:
                        </p>

                        <div className="bg-black/40 rounded-lg p-3.5 border border-white/5 font-mono text-[10px] leading-relaxed text-emerald-300/80 overflow-x-auto mb-4 relative">
                            <span className="absolute top-2 right-2 text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-white/30 font-mono">JSON</span>
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
                            className={`border border-dashed rounded-xl px-6 py-7 text-center transition-all duration-200 ${dragActive
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
                                <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center mb-1 text-violet-400 border border-violet-500/20">
                                    <Upload className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-semibold text-white">
                                    Drag & drop or select JSON file
                                </span>
                                <span className="text-[9px] text-white/30 font-mono">
                                    pricing_overrides.json (max 5MB)
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {error && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                                <span className="text-xs text-red-200/90 font-mono leading-normal">{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                                <span className="text-xs text-emerald-200/90 font-mono leading-normal">{success}</span>
                            </div>
                        )}

                        {uploading && (
                            <div className="flex items-center gap-2 text-xs text-white/50 justify-center font-mono">
                                <RefreshCw className="h-4 w-4 animate-spin text-violet-400" />
                                <span>Ingesting custom pricing override...</span>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Right Card: Table of active pricing overrides */}
                <Card className="border-white/[0.08] bg-[#0c0c0e]/85 p-6 backdrop-blur-md flex flex-col justify-between rounded-xl shadow-xl transition-all hover:border-white/10">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                                <Coins className="h-4 w-4 text-violet-400" />
                                Active Overrides
                            </h3>
                            {overrides.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearOverrides}
                                    className="h-7 gap-1 text-[10px] font-mono text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-2"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Reset Catalog
                                </Button>
                            )}
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-xs text-white/40 flex flex-col items-center gap-2 font-mono">
                                <RefreshCw className="h-6 w-6 animate-spin text-violet-400" />
                                <span>Loading catalog overrides...</span>
                            </div>
                        ) : overrides.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-black/20 p-8 text-center space-y-3">
                                <FileText className="h-8 w-8 text-white/20 mx-auto" />
                                <p className="text-xs text-white/40 leading-relaxed font-mono max-w-[280px] mx-auto">
                                    No custom overrides found. Public prices apply to calculations.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-white/5 bg-black/20 max-h-[220px] overflow-y-auto pr-1">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-white/10 bg-white/5 hover:bg-transparent">
                                            <TableHead className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Model</TableHead>
                                            <TableHead className="text-right text-white/40 text-[10px] font-mono uppercase tracking-wider">Input/1M</TableHead>
                                            <TableHead className="text-right text-white/40 text-[10px] font-mono uppercase tracking-wider">Output/1M</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {overrides.map((override) => (
                                            <TableRow key={override.id} className="border-white/5 hover:bg-white/[0.01]">
                                                <TableCell className="font-mono text-xs text-white/80 py-2 truncate max-w-[130px]" title={override.model_name}>
                                                    {override.model_name}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-emerald-400 py-2">
                                                    ${override.input_price_per_1m.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-emerald-400 py-2">
                                                    ${override.output_price_per_1m.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.01] p-3 text-[10px] font-mono leading-relaxed text-white/40">
                        * Overrides are synchronized immediately. All downstream waste triggers and routing calculations hot-reload in real-time.
                    </div>
                </Card>
            </div>

            {/* API Keys Panel */}
            <Card className="border-white/[0.08] bg-[#0c0c0e]/85 p-6 backdrop-blur-md rounded-xl mt-8 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-4 mb-6">
                    <div className="space-y-1">
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
                            <KeyRound className="h-4.5 w-4.5 text-violet-400" />
                            Direct SDK API Authentication
                        </h3>
                        <p className="text-xs text-white/40 font-mono">
                            Generate and manage secure credentials to ingest live telemetry via Node.js/Python SDK.
                        </p>
                    </div>
                </div>

                {generatedKey && (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 mb-6 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-violet-300 font-mono">COPY YOUR API KEY</span>
                            <span className="text-[9px] text-violet-400 font-mono">Copy now — this key will not be displayed again!</span>
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2.5 border border-white/5 font-mono text-xs text-white">
                            <span className="flex-1 select-all break-all">{generatedKey}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCopyKey}
                                className="h-8 w-8 p-0 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                    {/* Key Creation Form */}
                    <div className="md:col-span-1 space-y-4">
                        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-white/40">Create API Key</h4>
                        <form onSubmit={handleGenerateKey} className="space-y-3">
                            <input
                                type="text"
                                placeholder="Key name (e.g. Prod API)"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-white/30 focus:border-violet-500/50 focus:outline-none font-mono"
                            />
                            <Button
                                type="submit"
                                disabled={keyLoading || !newKeyName.trim()}
                                className="w-full h-9 bg-violet-600 hover:bg-violet-500 text-xs font-mono font-bold text-white shadow-lg hover:shadow-violet-600/10 transition-all flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/30"
                            >
                                <Plus className="h-4 w-4" />
                                Ingest New Key
                            </Button>
                        </form>
                    </div>

                    {/* Keys Table */}
                    <div className="md:col-span-2 space-y-4">
                        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-white/40">Active Credentials</h4>
                        {keyLoading && keys.length === 0 ? (
                            <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center gap-2 font-mono">
                                <RefreshCw className="h-6 w-6 animate-spin text-violet-400" />
                                <span>Syncing active keys...</span>
                            </div>
                        ) : keys.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-black/20 p-8 text-center space-y-2">
                                <KeyRound className="h-8 w-8 text-white/20 mx-auto" />
                                <p className="text-xs text-white/40 font-mono">No credentials generated yet.</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-white/5 bg-black/20 max-h-[220px] overflow-y-auto pr-1">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-white/10 bg-white/5 hover:bg-transparent">
                                            <TableHead className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Label</TableHead>
                                            <TableHead className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Prefix</TableHead>
                                            <TableHead className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Created</TableHead>
                                            <TableHead className="text-right text-white/40 text-[10px] font-mono uppercase tracking-wider">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {keys.map((k) => (
                                            <TableRow key={k.id} className="border-white/5 hover:bg-white/[0.01]">
                                                <TableCell className="text-xs text-white/80 py-2.5 font-semibold font-mono">{k.name}</TableCell>
                                                <TableCell className="font-mono text-xs text-violet-400 py-2.5">{k.prefix}...</TableCell>
                                                <TableCell className="text-xs text-white/40 py-2.5 font-mono">
                                                    {new Date(k.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRevokeKey(k.id)}
                                                        className="h-6 text-[9px] font-mono font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-2"
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

                {/* SDK Integration Examples */}
                <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-violet-400" />
                        SDK Tunnel Setup
                    </h4>
                    <p className="text-xs text-white/50 leading-relaxed font-mono">
                        Aurex ingests active telemetry with near-zero latency bounds. Initialize our wrapper in your server pipeline:
                    </p>

                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Python Example */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-blue-400 font-mono">Python SDK</span>
                                    <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.2 rounded text-white/40 font-mono">pip install aurex-sdk</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => copySdkSnippet("py", pythonCode)}
                                    className="h-6 w-6 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded"
                                >
                                    {sdkCopyState["py"] ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                </Button>
                            </div>
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5 font-mono text-[9px] leading-relaxed text-emerald-300/80 overflow-x-auto shadow-inner">
                                <pre>{pythonCode}</pre>
                            </div>
                        </div>

                        {/* Node.js Example */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-emerald-400 font-mono">Node.js SDK</span>
                                    <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.2 rounded text-white/40 font-mono">npm install @aurex/sdk</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => copySdkSnippet("js", nodeCode)}
                                    className="h-6 w-6 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded"
                                >
                                    {sdkCopyState["js"] ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                </Button>
                            </div>
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5 font-mono text-[9px] leading-relaxed text-emerald-300/80 overflow-x-auto shadow-inner">
                                <pre>{nodeCode}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
