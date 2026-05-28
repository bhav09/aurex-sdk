"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { aurixAPI, ApiKeyGenerated, ApiKeyMetadata } from "@/lib/api-client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
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

type Project = { id: string; org_id: string; name: string; environment: string };

const DEFAULT_SCOPES = ["ledger:write", "policy:read", "savings:write"];
const ALL_SCOPES = ["ledger:write", "policy:read", "savings:write", "policy:write", "savings:read"];

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [projectId, setProjectId] = useState<string>("");
    const [environment, setEnvironment] = useState<"dev" | "staging" | "prod">("dev");
    const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);

    const [reveal, setReveal] = useState<ApiKeyGenerated | null>(null);
    const [confirmedSafe, setConfirmedSafe] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [k, p] = await Promise.all([aurixAPI.listKeysV1(), aurixAPI.listProjects()]);
            setKeys(k);
            setProjects(p);
            if (p.length > 0 && !projectId) setProjectId(p[0].id);
        } catch (e: any) {
            setError(e?.message || "Failed to load API keys.");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const projectName = useMemo(() => {
        const map = new Map(projects.map((p) => [p.id, p.name]));
        return (id: string | null) => (id ? map.get(id) || id.slice(0, 8) : "—");
    }, [projects]);

    const onSubmitCreate = async () => {
        if (!name || !projectId) return;
        setCreating(true);
        try {
            const generated = await aurixAPI.createKeyV1({
                name,
                project_id: projectId,
                environment,
                scopes,
            });
            setReveal(generated);
            setConfirmedSafe(false);
            setCreateOpen(false);
            setName("");
            setScopes(DEFAULT_SCOPES);
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to create key");
        } finally {
            setCreating(false);
        }
    };

    const onRevoke = async (k: ApiKeyMetadata) => {
        try {
            await aurixAPI.revokeKeyV1(k.id);
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to revoke key");
        }
    };

    const onRotate = async (k: ApiKeyMetadata) => {
        try {
            const generated = await aurixAPI.rotateKeyV1(k.id);
            setReveal(generated);
            setConfirmedSafe(false);
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to rotate key");
        }
    };

    const copySecret = async (key: string) => {
        try {
            await navigator.clipboard.writeText(key);
        } catch (e) {
            console.warn("clipboard failed", e);
        }
    };

    const downloadEnv = (key: string) => {
        const blob = new Blob([`AUREX_ENABLED=1\nAUREX_API_KEY=${key}\n`], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = ".env.aurex";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Project-scoped credentials for the Aurex SDK.
                    </p>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>+ Create API key</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create API key</DialogTitle>
                            <DialogDescription>
                                The full secret is shown once. Store it somewhere safe.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="key-name">Name</Label>
                                <Input
                                    id="key-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Production server"
                                />
                            </div>
                            <div>
                                <Label>Project</Label>
                                <Select value={projectId} onValueChange={setProjectId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name} ({p.environment})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Environment</Label>
                                <Select
                                    value={environment}
                                    onValueChange={(v) => setEnvironment(v as "dev" | "staging" | "prod")}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dev">dev</SelectItem>
                                        <SelectItem value="staging">staging</SelectItem>
                                        <SelectItem value="prod">prod</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Scopes</Label>
                                <div className="mt-2 space-y-1.5">
                                    {ALL_SCOPES.map((s) => (
                                        <label key={s} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={scopes.includes(s)}
                                                onChange={(e) =>
                                                    setScopes((prev) =>
                                                        e.target.checked
                                                            ? [...prev, s]
                                                            : prev.filter((x) => x !== s)
                                                    )
                                                }
                                            />
                                            <code>{s}</code>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={onSubmitCreate}
                                disabled={creating || !name || !projectId}
                            >
                                {creating ? "Creating…" : "Create key"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {error && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
            ) : keys.length === 0 ? (
                <div className="rounded-lg border p-8 text-center">
                    <h2 className="text-lg font-medium">Create your first API key</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Use it to authenticate the Aurex SDK from your application.
                    </p>
                    <pre className="mx-auto mt-4 max-w-md rounded bg-muted p-3 text-left text-xs">
{`export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_…
python my_app.py`}
                    </pre>
                </div>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Prefix</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Environment</TableHead>
                                <TableHead>Scopes</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last used</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {keys.map((k) => (
                                <TableRow key={k.id}>
                                    <TableCell className="font-medium">{k.name}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {k.prefix}…{k.last4 || "----"}
                                    </TableCell>
                                    <TableCell>{projectName(k.project_id)}</TableCell>
                                    <TableCell>{k.environment || "—"}</TableCell>
                                    <TableCell className="text-xs">
                                        {(k.scopes || []).join(", ") || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {new Date(k.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {k.last_used_at
                                            ? new Date(k.last_used_at).toLocaleDateString()
                                            : "Never"}
                                    </TableCell>
                                    <TableCell>
                                        {k.revoked_at || !k.is_active ? (
                                            <Badge variant="destructive">Revoked</Badge>
                                        ) : (
                                            <Badge>Active</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {!k.revoked_at && k.is_active && (
                                            <div className="flex justify-end gap-2">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            Rotate
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Rotate this key?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                A new secret will be issued. The old key keeps
                                                                working for 24 hours then gets revoked.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => onRotate(k)}>
                                                                Rotate
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            Revoke
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Any process using this key will start receiving
                                                                401 errors within 60 seconds. This cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => onRevoke(k)}>
                                                                Revoke
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

            {/* One-time reveal modal */}
            <Dialog
                open={!!reveal}
                onOpenChange={(open) => {
                    if (!open && confirmedSafe) setReveal(null);
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Save this API key</DialogTitle>
                        <DialogDescription>
                            You will not see this secret again. Copy it now or download it as an .env file.
                        </DialogDescription>
                    </DialogHeader>
                    {reveal && (
                        <div className="space-y-3">
                            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{reveal.key}</pre>
                            <div className="flex gap-2">
                                <Button onClick={() => copySecret(reveal.key)} size="sm">
                                    Copy to clipboard
                                </Button>
                                <Button
                                    onClick={() => downloadEnv(reveal.key)}
                                    variant="outline"
                                    size="sm"
                                >
                                    Download as .env
                                </Button>
                            </div>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={confirmedSafe}
                                    onChange={(e) => setConfirmedSafe(e.target.checked)}
                                />
                                I&rsquo;ve stored it safely.
                            </label>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            disabled={!confirmedSafe}
                            onClick={() => setReveal(null)}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
