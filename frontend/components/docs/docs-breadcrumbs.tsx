"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

export function DocsBreadcrumbs() {
  const pathname = usePathname();
  
  if (!pathname || pathname === "/docs") return null;

  const paths = pathname.split("/").filter(Boolean);
  
  // E.g. ['docs', 'reference', 'guards']
  return (
    <nav className="flex items-center gap-1.5 text-xs font-mono text-white/40 mb-6 uppercase tracking-wider">
      <Link href="/docs" className="hover:text-white transition-colors flex items-center">
        <Home className="w-3 h-3 mr-1" />
        DOCS
      </Link>
      
      {paths.slice(1).map((segment, idx) => {
        const href = "/" + paths.slice(0, idx + 2).join("/");
        const isLast = idx === paths.length - 2;
        const name = segment.replace(/-/g, " ");
        
        return (
          <div key={href} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-white/20" />
            {isLast ? (
              <span className="text-teal-400 font-semibold">{name}</span>
            ) : (
              <Link href={href} className="hover:text-white transition-colors">
                {name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
