"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export interface DualCodeBlockProps {
  pythonCode: string;
  nodeCode: string;
  pythonId: string;
  nodeId: string;
  pythonTitle?: string;
  nodeTitle?: string;
}

export function DualCodeBlock({
  pythonCode,
  nodeCode,
  pythonId,
  nodeId,
  pythonTitle = "Python",
  nodeTitle = "Node.js",
}: DualCodeBlockProps) {
  const [copiedPy, setCopiedPy] = useState(false);
  const [copiedNode, setCopiedNode] = useState(false);

  const handleCopyPy = async () => {
    try {
      await navigator.clipboard.writeText(pythonCode);
      setCopiedPy(true);
      setTimeout(() => setCopiedPy(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const handleCopyNode = async () => {
    try {
      await navigator.clipboard.writeText(nodeCode);
      setCopiedNode(true);
      setTimeout(() => setCopiedNode(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-6">
      <div className="relative group rounded-xl border border-white/[0.08] bg-surface-sunken overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.02] text-xs font-mono text-white/40">
          <span className="text-emerald-400 font-semibold">{pythonTitle}</span>
          <button
            id={pythonId}
            onClick={handleCopyPy}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            {copiedPy ? (
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
        <div className="p-4 overflow-x-auto flex-1">
          <pre className="font-mono text-[13px] text-white/80 leading-relaxed whitespace-pre select-all">
            {pythonCode}
          </pre>
        </div>
      </div>

      <div className="relative group rounded-xl border border-white/[0.08] bg-surface-sunken overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.02] text-xs font-mono text-white/40">
          <span className="text-indigo-400 font-semibold">{nodeTitle}</span>
          <button
            id={nodeId}
            onClick={handleCopyNode}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            {copiedNode ? (
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
        <div className="p-4 overflow-x-auto flex-1">
          <pre className="font-mono text-[13px] text-white/80 leading-relaxed whitespace-pre select-all">
            {nodeCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
