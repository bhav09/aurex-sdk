"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApiKeysRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/app/settings?tab=apikeys");
    }, [router]);

    return (
        <div className="flex h-[60vh] items-center justify-center text-sm text-white/40 bg-background">
            <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Redirecting to settings...</span>
            </div>
        </div>
    );
}
