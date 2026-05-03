"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type BentoMetricCardProps = {
    children: ReactNode;
    className?: string;
};

export function BentoMetricCard({ children, className }: BentoMetricCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [glow, setGlow] = useState({ x: 50, y: 50, active: false });

    const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setGlow({
            x: ((e.clientX - r.left) / r.width) * 100,
            y: ((e.clientY - r.top) / r.height) * 100,
            active: true,
        });
    };

    return (
        <motion.div
            ref={ref}
            className={cn(
                "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-md",
                className
            )}
            onMouseMove={handleMove}
            onMouseEnter={() => setGlow((g) => ({ ...g, active: true }))}
            onMouseLeave={() => setGlow((g) => ({ ...g, active: false }))}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
            <div
                className={cn(
                    "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                    glow.active && "opacity-100"
                )}
                style={{
                    background: `radial-gradient(600px circle at ${glow.x}% ${glow.y}%, rgba(139, 92, 246, 0.12), rgba(56, 189, 248, 0.06) 35%, transparent 55%)`,
                }}
            />
            <div className="relative z-10">{children}</div>
        </motion.div>
    );
}
