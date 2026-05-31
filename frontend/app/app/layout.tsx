"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { aurexAPI } from "@/lib/api-client";
import { OnboardingModal } from "@/components/app/onboarding-modal";
import { UserDropdown } from "@/components/app/user-dropdown";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        if (!aurexAPI.hasActiveSession()) {
            router.replace("/");
            return;
        }

        async function checkOnboarding() {
            try {
                const projects = await aurexAPI.listProjects();
                const needsOnboarding = projects.some(p => p.name === "Default" || p.name === "default");
                setShowOnboarding(needsOnboarding);
            } catch (err) {
                console.error("Failed to check project onboarding status", err);
            } finally {
                setReady(true);
            }
        }

        void checkOnboarding();
    }, [router]);

    if (!ready) {
        return (
            <div className="flex h-screen items-center justify-center text-sm text-muted-foreground bg-[#0A0A0A]">
                <div className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Loading workspace…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans bg-[#030303]">
            <header className="border-b border-white/[0.08] bg-[#0A0A0A]/50 backdrop-blur-md sticky top-0 z-40">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-lg font-serif uppercase tracking-wider font-semibold text-white/90">
                            Aurex
                        </Link>
                        <nav className="flex items-center gap-6 text-sm text-white/60">
                            <Link href="/app" className="hover:text-white transition-colors duration-200">
                                Overview
                            </Link>
                        </nav>
                    </div>
                    <div className="flex items-center gap-4">
                        <UserDropdown />
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

            <OnboardingModal 
                isOpen={showOnboarding} 
                onSuccess={() => setShowOnboarding(false)} 
            />
        </div>
    );
}
