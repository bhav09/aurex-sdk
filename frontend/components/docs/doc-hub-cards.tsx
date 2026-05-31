import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type HubCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function DocHubCards({ cards }: { cards: HubCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        >
          <card.icon className="w-5 h-5 text-emerald-400 mb-3" />
          <h2 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
            {card.title}
          </h2>
          <p className="text-sm text-white/45 mt-1 leading-relaxed">{card.description}</p>
        </Link>
      ))}
    </div>
  );
}
