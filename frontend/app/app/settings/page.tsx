"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { aurexAPI, ApiKeyGenerated, ApiKeyMetadata } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Key, Shield, Building2, Plus, Check, RefreshCw, Trash2, Copy, Download } from "lucide-react";

type Project = { id: string; org_id: string; name: string; environment: string };

const DEFAULT_SCOPES = ["ledger:write", "policy:read", "savings:write"];
const ALL_SCOPES = ["ledger:write", "policy:read", "savings:write", "policy:write", "savings:read"];

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<"tenancy" | "apikeys">("tenancy");

    const orgId = aurexAPI.getOrgId();
    const userInfo = aurexAPI.getUserInfo();

    // Tenancy config states
    const [projects, setProjects] = useState<Project[]>([]);
    const [orgName, setOrgName] = useState("");
    const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);

    // Selected project to update
    const [editingProjectId, setEditingProjectId] = useState<string>("");
    const [editProjName, setEditProjName] = useState("");
    const [editProjEnv, setEditProjEnv] = useState<"dev" | "staging" | "prod">("dev");
    const [isUpdatingProj, setIsUpdatingProj] = useState(false);

    // New Project states
    const [newProjOpen, setNewProjOpen] = useState(false);
    const [newProjName, setNewProjName] = useState("");
    const [newProjEnv, setNewProjEnv] = useState<"dev" | "staging" | "prod">("dev");
    const [isCreatingProj, setIsCreatingProj] = useState(false);

    // API Key states
    const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Create API Key dialog states
    const [createKeyOpen, setCreateKeyOpen] = useState(false);
    const [creatingKey, setCreatingKey] = useState(false);
    const [keyName, setKeyName] = useState("");
    const [targetProjId, setTargetProjId] = useState("");
    const [keyEnv, setKeyEnv] = useState<"dev" | "staging" | "prod">("dev");
    const [keyScopes, setKeyScopes] = useState<string[]>(DEFAULT_SCOPES);

    // One-time reveal modal states
    const [reveal, setReveal] = useState<ApiKeyGenerated | null>(null);
    const [confirmedSafe, setConfirmedSafe] = useState(false);

    // Load initial data
    const loadAllData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [k, p] = await Promise.all([
                aurexAPI.listKeysV1(),
                aurexAPI.listProjects()
            ]);
            setKeys(k);
            setProjects(p);

            // Populate selected project editing info
            if (p.length > 0) {
                const activeId = aurexAPI.getProjectId() || p[0].id;
                const match = p.find(proj => proj.id === activeId) || p[0];
                setEditingProjectId(match.id);
                setEditProjName(match.name);
                setEditProjEnv(match.environment as any);
                setTargetProjId(match.id);
            }

            // Estimate/Retrieve Organization Name
            if (p.length > 0 && orgId) {
                // Wait, listProjects doesn't return full org name details but we split by default naming
                const firstProj = p[0];
                if (userInfo?.email) {
                    const prefix = userInfo.email.split("@")[0];
                    setOrgName(`${prefix.charAt(0).toUpperCase() + prefix.slice(1)}'s Org`);
                }
            }
        } catch (e: any) {
            setError(e?.message || "Failed to load settings configuration.");
        } finally {
            setLoading(false);
        }
    }, [orgId, userInfo?.email]);

    useEffect(() => {
        void loadAllData();
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get("tab");
            if (tab === "apikeys" || tab === "api-keys") {
                setActiveSection("apikeys");
            }
        }
    }, [loadAllData]);

    const handleProjSelectionChange = (projId: string) => {
        const match = projects.find(p => p.id === projId);
        if (match) {
            setEditingProjectId(match.id);
            setEditProjName(match.name);
            setEditProjEnv(match.environment as any);
        }
    };

    // Update Organization Handler
    const handleUpdateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !orgName) return;
        setIsUpdatingOrg(true);
        setError(null);
        setSuccessMsg(null);
        try {
            await aurexAPI.updateOrganization(orgId, orgName);
            setSuccessMsg("Organization name updated successfully.");
            await loadAllData();
        } catch (err: any) {
            setError(err.message || "Failed to update organization name.");
        } finally {
            setIsUpdatingOrg(false);
        }
    };

    // Update Project Handler
    const handleUpdateProj = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProjectId || !editProjName) return;
        setIsUpdatingProj(true);
        setError(null);
        setSuccessMsg(null);
        try {
            await aurexAPI.updateProject(editingProjectId, {
                name: editProjName,
                environment: editProjEnv
            });
            setSuccessMsg("Project configuration updated successfully.");
            await loadAllData();
        } catch (err: any) {
            setError(err.message || "Failed to update project configurations.");
        } finally {
            setIsUpdatingProj(false);
        }
    };

    // Create New Project Handler
    const handleCreateProj = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjName) return;
        setIsCreatingProj(true);
        setError(null);
        try {
            const fresh = await aurexAPI.createProject(newProjName, newProjEnv);
            setNewProjOpen(false);
            setNewProjName("");
            setSuccessMsg(`Workspace project '${fresh.name}' created successfully.`);
            await loadAllData();
        } catch (err: any) {
            setError(err.message || "Failed to create new project.");
        } finally {
            setIsCreatingProj(false);
        }
    };

    // API Key generation submit
    const onSubmitCreateKey = async () => {
        if (!keyName || !targetProjId) return;
        setCreatingKey(true);
        setError(null);
        try {
            const generated = await aurexAPI.createKeyV1({
                name: keyName,
                project_id: targetProjId,
                environment: keyEnv,
                scopes: keyScopes,
            });
            setReveal(generated);
            setConfirmedSafe(false);
            setCreateKeyOpen(false);
            setKeyName("");
            setKeyScopes(DEFAULT_SCOPES);
            await loadAllData();
        } catch (e: any) {
            setError(e?.message || "Failed to create API credential");
        } finally {
            setCreatingKey(false);
        }
    };

    // API Key revocation
    const onRevokeKey = async (k: ApiKeyMetadata) => {
        setError(null);
        setSuccessMsg(null);
        try {
            await aurexAPI.revokeKeyV1(k.id);
            setSuccessMsg("API credential revoked successfully.");
            await loadAllData();
        } catch (e: any) {
            setError(e?.message || "Failed to revoke credential");
        }
    };

    // API Key rotation
    const onRotateKey = async (k: ApiKeyMetadata) => {
        setError(null);
        try {
            const generated = await aurexAPI.rotateKeyV1(k.id);
            setReveal(generated);
            setConfirmedSafe(false);
            await loadAllData();
        } catch (e: any) {
            setError(e?.message || "Failed to rotate API credential");
        }
    };

    const copySecretToClipboard = async (secret: string) => {
        try {
            await navigator.clipboard.writeText(secret);
        } catch (e) {
            console.warn("Clipboard access failed", e);
        }
    };

    const downloadEnvFile = (secret: string) => {
        const blob = new Blob([`AUREX_ENABLED=1\nAUREX_API_KEY=${secret}\n`], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = ".env.aurex";
        a.click();
        URL.revokeObjectURL(url);
    };

    const projectNameMapper = useMemo(() => {
        const map = new Map(projects.map((p) => [p.id, p.name]));
        return (id: string | null) => (id ? map.get(id) || id.slice(0, 8) : "—");
    }, [projects]);

    return (
        <div className="flex flex-col lg:flex-row gap-8 text-white min-h-[80vh] bg-background">
            {/* Sidebar Navigation */}
            <div className="w-full lg:w-60 shrink-0 space-y-1">
                <div className="px-3 py-2">
                    <h2 className="mb-4 text-xs font-serif uppercase tracking-wider text-white/40">Workspace Settings</h2>
                </div>
                {[
                    { id: "tenancy", label: "Workspace & Tenancy", icon: Building2 },
                    { id: "apikeys", label: "API Credentials", icon: Key }
                ].map((sec) => {
                    const Icon = sec.icon;
                    return (
                        <button
                            key={sec.id}
                            onClick={() => {
                                setActiveSection(sec.id as any);
                                setError(null);
                                setSuccessMsg(null);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-xl transition-all duration-300 ${
                                activeSection === sec.id
                                    ? "bg-white/[0.05] text-white"
                                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.01]"
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {sec.label}
                        </button>
                    );
                })}
            </div>

            {/* Main Panels */}
            <div className="flex-1 space-y-6 max-w-4xl min-w-0">
                {/* Messages */}
                {error && (
                    <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        {error}
                    </div>
                )}
                {successMsg && (
                    <div className="p-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {successMsg}
                    </div>
                )}

                {/* TENANCY CONFIGURATION PANEL */}
                {activeSection === "tenancy" && (
                    <div className="space-y-6">
                        {/* Org Config */}
                        <Card className="bg-surface border-white/[0.06]">
                            <CardHeader>
                                <CardTitle className="text-xs uppercase tracking-wider text-white/60">Organization Management</CardTitle>
                                <CardDescription className="text-white/40 text-[10px]">Rename or update organization details.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleUpdateOrg} className="space-y-4">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="tenant-org" className="text-white/40 text-[10px] uppercase font-semibold">Organization Name</Label>
                                        <div className="flex gap-3">
                                            <Input
                                                id="tenant-org"
                                                required
                                                value={orgName}
                                                onChange={(e) => setOrgName(e.target.value)}
                                                className="bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] text-xs max-w-sm rounded-lg"
                                            />
                                            <Button
                                                type="submit"
                                                disabled={isUpdatingOrg || !orgName}
                                                className="bg-white hover:bg-white/90 text-black text-xs font-semibold px-4 rounded-lg transition-all duration-300"
                                            >
                                                {isUpdatingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        {/* Project Config */}
                        <Card className="bg-surface border-white/[0.06]">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-xs uppercase tracking-wider text-white/60">Project Settings</CardTitle>
                                    <CardDescription className="text-white/40 text-[10px]">Configure existing projects or spin up a new environment.</CardDescription>
                                </div>
                                <Dialog open={newProjOpen} onOpenChange={setNewProjOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="h-8 border-white/10 hover:bg-white/5 text-xs gap-1.5 rounded-lg">
                                            <Plus className="w-3.5 h-3.5" /> New Project
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-surface/95 border-white/[0.08] text-white backdrop-blur-2xl rounded-2xl shadow-2xl">
                                        <DialogHeader>
                                            <DialogTitle className="text-lg font-serif uppercase tracking-wide">Create New Project</DialogTitle>
                                            <DialogDescription className="text-white/50 text-xs">Provision a new scoped environment for SDK usage metrics.</DialogDescription>
                                        </DialogHeader>
                                        <form onSubmit={handleCreateProj} className="space-y-4 py-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-white/70 text-[10px] uppercase">Project Name</Label>
                                                <Input
                                                    required
                                                    placeholder="e.g. Chatbot Service"
                                                    value={newProjName}
                                                    onChange={(e) => setNewProjName(e.target.value)}
                                                    className="bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] text-xs rounded-lg"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-white/70 text-[10px] uppercase">Environment</Label>
                                                <Select
                                                    value={newProjEnv}
                                                    onValueChange={(v) => setNewProjEnv(v as any)}
                                                >
                                                    <SelectTrigger className="bg-white/[0.02] border-white/[0.08] text-white rounded-lg text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-surface border-white/[0.08] text-white">
                                                        <SelectItem value="dev">dev</SelectItem>
                                                        <SelectItem value="staging">staging</SelectItem>
                                                        <SelectItem value="prod">prod</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <DialogFooter className="pt-2">
                                                <Button type="submit" disabled={isCreatingProj || !newProjName} className="bg-white text-black text-xs font-semibold w-full rounded-lg">
                                                    {isCreatingProj ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : "Create Project"}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </CardHeader>
                            <CardContent>
                                {projects.length > 0 ? (
                                    <form onSubmit={handleUpdateProj} className="space-y-5">
                                        <div className="grid gap-1.5">
                                            <Label className="text-white/40 text-[10px] uppercase font-semibold">Select Project to Edit</Label>
                                            <Select value={editingProjectId} onValueChange={handleProjSelectionChange}>
                                                <SelectTrigger className="bg-white/[0.02] border-white/[0.08] text-white text-xs max-w-sm rounded-lg">
                                                    <SelectValue placeholder="Select a project" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-surface border-white/[0.08] text-white">
                                                    {projects.map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name} ({p.environment})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-4 max-w-sm">
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="proj-name" className="text-white/40 text-[10px] uppercase font-semibold">Project Name</Label>
                                                <Input
                                                    id="proj-name"
                                                    required
                                                    value={editProjName}
                                                    onChange={(e) => setEditProjName(e.target.value)}
                                                    className="bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] text-xs rounded-lg"
                                                />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-white/40 text-[10px] uppercase font-semibold">Project Environment</Label>
                                                <Select
                                                    value={editProjEnv}
                                                    onValueChange={(v) => setEditProjEnv(v as any)}
                                                >
                                                    <SelectTrigger className="bg-white/[0.02] border-white/[0.08] text-white rounded-lg text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-surface border-white/[0.08] text-white">
                                                        <SelectItem value="dev">dev</SelectItem>
                                                        <SelectItem value="staging">staging</SelectItem>
                                                        <SelectItem value="prod">prod</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button
                                                type="submit"
                                                disabled={isUpdatingProj || !editProjName}
                                                className="bg-white hover:bg-white/90 text-black text-xs font-semibold w-full rounded-lg transition-all duration-300"
                                            >
                                                {isUpdatingProj ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Project Settings"}
                                            </Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="text-center text-xs text-white/30 py-4">No projects registered.</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* API KEY PANEL */}
                {activeSection === "apikeys" && (
                    <Card className="bg-surface border-white/[0.06]">
                        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-4">
                            <div>
                                <CardTitle className="text-xs uppercase tracking-wider text-white/60">API Keys</CardTitle>
                                <CardDescription className="text-white/40 text-[10px]">Project-scoped credentials for SDK integration.</CardDescription>
                            </div>
                            <Dialog open={createKeyOpen} onOpenChange={setCreateKeyOpen}>
                                <DialogTrigger asChild>
                                    <Button className="h-8 text-xs bg-white hover:bg-white/90 text-black font-semibold rounded-lg">
                                        + Generate Key
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-surface/95 border-white/[0.08] text-white backdrop-blur-2xl rounded-2xl shadow-2xl">
                                    <DialogHeader>
                                        <DialogTitle className="text-lg font-serif uppercase tracking-wide">Generate API key</DialogTitle>
                                        <DialogDescription className="text-white/50 text-xs">
                                            The full secret key will be displayed once. Please save it securely.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="key-desc" className="text-white/70 text-[10px] uppercase">Name / Description</Label>
                                            <Input
                                                id="key-desc"
                                                value={keyName}
                                                onChange={(e) => setKeyName(e.target.value)}
                                                placeholder="e.g. Production Client SDK"
                                                className="bg-white/[0.02] border-white/[0.08] text-xs rounded-lg"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-white/70 text-[10px] uppercase">Target Project</Label>
                                            <Select value={targetProjId} onValueChange={setTargetProjId}>
                                                <SelectTrigger className="bg-white/[0.02] border-white/[0.08] text-white text-xs rounded-lg">
                                                    <SelectValue placeholder="Select target project" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-surface border-white/[0.08] text-white">
                                                    {projects.map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name} ({p.environment})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-white/70 text-[10px] uppercase">Project Environment</Label>
                                            <Select
                                                value={keyEnv}
                                                onValueChange={(v) => setKeyEnv(v as any)}
                                            >
                                                <SelectTrigger className="bg-white/[0.02] border-white/[0.08] text-white rounded-lg text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-surface border-white/[0.08] text-white">
                                                    <SelectItem value="dev">dev</SelectItem>
                                                    <SelectItem value="staging">staging</SelectItem>
                                                    <SelectItem value="prod">prod</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-white/70 text-[10px] uppercase">Credential Scopes</Label>
                                            <div className="mt-2 space-y-2">
                                                {ALL_SCOPES.map((s) => (
                                                    <label key={s} className="flex items-center gap-2 text-xs text-white/75 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={keyScopes.includes(s)}
                                                            onChange={(e) =>
                                                                setKeyScopes((prev) =>
                                                                    e.target.checked
                                                                        ? [...prev, s]
                                                                        : prev.filter((x) => x !== s)
                                                                )
                                                            }
                                                            className="rounded border-white/20 bg-white/[0.02]"
                                                        />
                                                        <code className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded">{s}</code>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter className="pt-2">
                                        <Button variant="ghost" onClick={() => setCreateKeyOpen(false)} className="text-xs text-white/50 hover:bg-white/5">
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={onSubmitCreateKey}
                                            disabled={creatingKey || !keyName || !targetProjId}
                                            className="bg-white text-black text-xs font-semibold px-4 rounded-lg"
                                        >
                                            {creatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create key"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent>
                            {keys.length === 0 ? (
                                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-8 text-center">
                                    <Key className="w-8 h-8 text-white/30 mx-auto mb-3" />
                                    <h2 className="text-sm font-semibold">Generate your first API key</h2>
                                    <p className="mt-2 text-xs text-white/40 max-w-sm mx-auto">
                                        SDK keys connect your application environment's LLM pipeline requests with Aurex cost intelligence ledgers.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="border-white/[0.06]">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="text-white/40 text-xs">Name</TableHead>
                                                <TableHead className="text-white/40 text-xs">Prefix</TableHead>
                                                <TableHead className="text-white/40 text-xs">Project</TableHead>
                                                <TableHead className="text-white/40 text-xs">Environment</TableHead>
                                                <TableHead className="text-white/40 text-xs">Created</TableHead>
                                                <TableHead className="text-white/40 text-xs">Status</TableHead>
                                                <TableHead className="text-white/40 text-xs text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {keys.map((k) => (
                                                <TableRow key={k.id} className="border-white/[0.04] hover:bg-white/[0.01]">
                                                    <TableCell className="font-semibold text-xs">{k.name}</TableCell>
                                                    <TableCell className="font-mono text-xs text-white/70">
                                                        {k.prefix}…{k.last4 || "----"}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-teal-300 font-mono">{projectNameMapper(k.project_id)}</TableCell>
                                                    <TableCell className="text-xs font-mono">{k.environment || "—"}</TableCell>
                                                    <TableCell className="text-xs text-white/40">
                                                        {new Date(k.created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        {k.revoked_at || !k.is_active ? (
                                                            <Badge variant="destructive" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[9px] py-0 px-2">Revoked</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] py-0 px-2">Active</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!k.revoked_at && k.is_active && (
                                                            <div className="flex justify-end gap-2">
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5 text-white/50 hover:text-white rounded-lg">
                                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent className="bg-surface border-white/10 text-white rounded-2xl">
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle className="font-serif">Rotate API Key?</AlertDialogTitle>
                                                                            <AlertDialogDescription className="text-white/50 text-xs">
                                                                                This issues a fresh secret. The old key remains active for 24 hours to prevent production outages, then revokes automatically.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel className="bg-white/5 text-white hover:bg-white/10 border-0 rounded-lg text-xs">Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => onRotateKey(k)} className="bg-white text-black hover:bg-white/90 rounded-lg text-xs font-semibold">
                                                                                Rotate Key
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>

                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-rose-500/10 text-white/50 hover:text-rose-400 rounded-lg">
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent className="bg-surface border-white/10 text-white rounded-2xl">
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle className="font-serif">Revoke API Key?</AlertDialogTitle>
                                                                            <AlertDialogDescription className="text-white/50 text-xs">
                                                                                All integrations authenticating with this key will trigger 401 client auth errors immediately. This operation is permanent.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel className="bg-white/5 text-white hover:bg-white/10 border-0 rounded-lg text-xs">Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => onRevokeKey(k)} className="bg-rose-500 text-white hover:bg-rose-600 rounded-lg text-xs font-semibold">
                                                                                Revoke Key
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

            </div>

            {/* One-time reveal modal for generated keys */}
            <Dialog
                open={!!reveal}
                onOpenChange={(open) => {
                    if (!open && confirmedSafe) setReveal(null);
                }}
            >
                <DialogContent className="sm:max-w-lg bg-surface/95 border-white/10 text-white backdrop-blur-2xl rounded-2xl shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-serif uppercase tracking-wide">Copy API Key Secret</DialogTitle>
                        <DialogDescription className="text-white/50 text-xs">
                            This token will not be stored in cleartext. Make sure to copy it now.
                        </DialogDescription>
                    </DialogHeader>
                    {reveal && (
                        <div className="space-y-4 py-2">
                            <pre className="overflow-x-auto rounded-xl bg-white/[0.03] border border-white/10 p-3.5 font-mono text-xs text-white/95">{reveal.key}</pre>
                            <div className="flex gap-2">
                                <Button onClick={() => copySecretToClipboard(reveal.key)} size="sm" className="bg-white text-black hover:bg-white/90 text-xs font-semibold gap-1.5 rounded-lg">
                                    <Copy className="w-3.5 h-3.5" /> Copy to clipboard
                                </Button>
                                <Button
                                    onClick={() => downloadEnvFile(reveal.key)}
                                    variant="outline"
                                    size="sm"
                                    className="border-white/10 hover:bg-white/5 text-xs gap-1.5 rounded-lg text-white"
                                >
                                    <Download className="w-3.5 h-3.5" /> Download .env
                                </Button>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer pt-2">
                                <input
                                    type="checkbox"
                                    checked={confirmedSafe}
                                    onChange={(e) => setConfirmedSafe(e.target.checked)}
                                    className="rounded border-white/20 bg-white/[0.02]"
                                />
                                I have stored this key somewhere safe.
                            </label>
                        </div>
                    )}
                    <DialogFooter className="pt-2">
                        <Button
                            disabled={!confirmedSafe}
                            onClick={() => setReveal(null)}
                            className="bg-white text-black text-xs font-semibold w-full rounded-lg"
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
