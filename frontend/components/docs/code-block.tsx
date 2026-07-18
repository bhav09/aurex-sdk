"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";

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

  // Convert language to what prism expects, fallback to tsx or markup
  const lang = language.toLowerCase() === "python" ? "python" 
               : language.toLowerCase() === "bash" || language.toLowerCase() === "sh" ? "bash"
               : language.toLowerCase() === "yaml" || language.toLowerCase() === "yml" ? "yaml"
               : language.toLowerCase() === "json" ? "json"
               : "typescript";

  return (
    <div className="relative group rounded-xl border border-white/[0.08] bg-[#282c34] overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.02] text-xs font-mono text-white/40">
        <span>{language.toUpperCase()}</span>
        <button
          id={id}
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-teal-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-[13px] font-mono select-all">
        <Highlight theme={themes.oneDark} code={code.trim()} language={lang}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${className} bg-transparent! p-0 m-0 leading-relaxed`} style={{ ...style, backgroundColor: 'transparent' }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
