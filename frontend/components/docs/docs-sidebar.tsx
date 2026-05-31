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
                        ? "bg-white/[0.05] text-white border-l-2 border-emerald-500 pl-4 font-semibold"
                        : "text-white/45 hover:text-white/80 hover:bg-white/[0.02]"
                    }`}
                  >
                    <span>{item.label}</span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                        active ? "opacity-100 text-emerald-400" : "text-white/30"
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
