import { Bot } from "lucide-react";
import type { ReactNode } from "react";

type DocPageShellProps = {
  title: string;
  description: string;
  agentHint: string;
  scopeIn?: string[];
  scopeOut?: string[];
  children: ReactNode;
};

export function DocPageShell({
  title,
  description,
  agentHint,
  scopeIn,
  scopeOut,
  children,
}: DocPageShellProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white">{title}</h1>
        <p className="text-white/50 mt-2 leading-relaxed">{description}</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Bot className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-mono text-teal-400/80 uppercase tracking-wider mb-1">Agent hint</p>
          <p className="text-sm text-white/60">{agentHint}</p>
        </div>
      </div>

      {(scopeIn?.length || scopeOut?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {scopeIn?.length ? (
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
              <p className="text-white/80 font-medium mb-2">In scope</p>
              <ul className="space-y-1 text-white/45 list-disc list-inside">
                {scopeIn.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {scopeOut?.length ? (
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
              <p className="text-white/80 font-medium mb-2">Out of scope</p>
              <ul className="space-y-1 text-white/45 list-disc list-inside">
                {scopeOut.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {children}
    </div>
  );
}
