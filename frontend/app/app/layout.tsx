"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { aurixAPI } from "@/lib/api-client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!aurixAPI.hasActiveSession()) {
            router.replace("/audit");
            return;
        }
        setReady(true);
    }, [router]);

    if (!ready) {
        return (
            <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
                Loading…
            </div>
        );
    }

    const userInfo = aurixAPI.getUserInfo();

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-6">
                        <Link href="/app" className="text-lg font-semibold tracking-tight">
                            Aurex
                        </Link>
                        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Link href="/app" className="hover:text-foreground">
                                Overview
                            </Link>
                            <Link href="/app/api-keys" className="hover:text-foreground">
                                API Keys
                            </Link>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {userInfo?.email && <span>{userInfo.email}</span>}
                        <button
                            type="button"
                            onClick={() => {
                                aurixAPI.clearSession();
                                router.replace("/audit");
                            }}
                            className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
    );
}
