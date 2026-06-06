"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function TableOfContents() {
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const pathname = usePathname();

  useEffect(() => {
    // Small timeout to allow DOM to render completely
    const timer = setTimeout(() => {
      const elements = Array.from(document.querySelectorAll("h2, h3"))
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          text: el.textContent || "",
          level: Number(el.tagName.charAt(1)),
        }));
      setHeadings(elements);
    }, 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "0px 0px -80% 0px" }
    );

    const elements = document.querySelectorAll("h2, h3");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) {
    return (
      <div className="sticky top-28">
        <h4 className="text-xs font-semibold text-white/90 uppercase tracking-wider mb-4">On this page</h4>
        <div className="text-sm text-white/30 italic">No sections</div>
      </div>
    );
  }

  return (
    <div className="sticky top-28">
      <h4 className="text-xs font-semibold text-white/90 uppercase tracking-wider mb-4">On this page</h4>
      <nav className="flex flex-col gap-3 text-sm text-white/50">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className={`transition-colors ${
              activeId === heading.id ? "text-teal-400 font-medium" : "hover:text-white"
            } ${heading.level === 3 ? "pl-3 border-l border-white/10" : ""}`}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
