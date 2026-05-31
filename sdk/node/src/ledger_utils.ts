import fs from "fs";
import os from "os";
import path from "path";

export function resolveLedgerPath(configLedgerPath: string, perProcess: boolean): string {
  const base = process.env.AUREX_LEDGER_PATH || configLedgerPath;
  if (!perProcess) return base;

  const worker = process.env.AUREX_WORKER_ID || String(process.pid);
  const dir = path.dirname(base);
  const ext = path.extname(base) || ".jsonl";
  const name = path.basename(base, ext) || "ledger";
  return path.join(dir === "." ? ".aurex" : dir, `${name}.${worker}${ext}`);
}

function probeWritableDirectory(directory: string): boolean {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, ".aurex_write_probe");
    fs.writeFileSync(probe, "ok", "utf-8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function prepareLedgerStorage(
  ledgerPath: string,
  storageMode: "file" | "memory",
  perProcess: boolean,
): { ledgerPath: string; storageMode: "file" | "memory"; warning?: string } {
  if (storageMode !== "file") {
    return { ledgerPath, storageMode };
  }

  const resolved = resolveLedgerPath(ledgerPath, perProcess);
  const ledgerDir = path.dirname(resolved);
  if (probeWritableDirectory(ledgerDir)) {
    return { ledgerPath: resolved, storageMode: "file" };
  }

  const tmpPath = path.join(os.tmpdir(), ".aurex", path.basename(resolved));
  if (probeWritableDirectory(path.dirname(tmpPath))) {
    return {
      ledgerPath: tmpPath,
      storageMode: "file",
      warning: `[Aurex Warning] Ledger directory not writable (${ledgerDir}); using ${tmpPath}`,
    };
  }

  return {
    ledgerPath: resolved,
    storageMode: "memory",
    warning:
      "[Aurex Warning] No writable ledger path available; using memory-only storage.",
  };
}

export function emitWarningOnce(message: string, flag: { emitted?: boolean }): void {
  if (flag.emitted) return;
  console.error(message);
  flag.emitted = true;
}
