"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { docsNavGroups } from "./docs-nav";

function isActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0];
  if (base === "/docs") {
    return pathname === "/docs";
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full lg:w-64 shrink-0">
      <div className="sticky top-32 space-y-6 pt-2">
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/50 bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            <span>Search docs...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-medium text-white/50">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
        <div className="space-y-6">
          {docsNavGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest block px-3 mb-2 font-bold">
                {group.title}
              </span>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all flex items-center justify-between group ${
                      active
                        ? "bg-white/[0.05] text-white border-l-2 border-teal-500 pl-4 font-semibold"
                        : "text-white/45 hover:text-white/80 hover:bg-white/[0.02]"
                    }`}
                  >
                    <span>{item.label}</span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                        active ? "opacity-100 text-teal-400" : "text-white/30"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] text-xs text-white/45 space-y-3">
          <div>
            <strong className="text-white/70 block mb-0.5">Python SDK</strong>
            <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-[11px]">from aurex_sdk import ...</code>
          </div>
          <div>
            <strong className="text-white/70 block mb-0.5">Node.js SDK</strong>
            <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-[11px]">
              import {"{ AurexAuditor }"} from &quot;aurex-sdk&quot;
            </code>
          </div>
          <div>
            <strong className="text-white/70 block mb-0.5">Cloud Sync Ingestion</strong>
            <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-[11px]">POST /api/v1/ledger/events</code>
          </div>
        </div>
      </div>
    </aside>
  );
}
