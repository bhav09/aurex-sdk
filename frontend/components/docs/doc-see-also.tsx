import Link from "next/link";

export type SeeAlsoLink = {
  href: string;
  label: string;
};

export function DocSeeAlso({ links }: { links: SeeAlsoLink[] }) {
  if (!links.length) return null;

  return (
    <section className="pt-4 border-t border-white/[0.06]">
      <h2 className="text-sm font-semibold text-white/70 mb-3">See also</h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex px-3 py-1.5 text-sm rounded-lg border border-white/[0.08] bg-white/[0.02] text-indigo-400 hover:bg-white/[0.04] transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
