"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export interface CodeBlockProps {
  code: string;
  language: string;
  id: string;
}

export function CodeBlock({ code, language, id }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <div className="relative group rounded-xl border border-white/[0.08] bg-surface-sunken overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.02] text-xs font-mono text-white/40">
        <span>{language.toUpperCase()}</span>
        <button
          id={id}
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-[13px] text-white/80 leading-relaxed whitespace-pre select-all">
          {code}
        </pre>
      </div>
    </div>
  );
}
