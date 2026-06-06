"use client";

import { useState } from "react";
import { Lock, Mail, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aurexAPI, ExecutiveSummary } from "@/lib/api-client";

interface ScoreGateStepProps {
    data: ExecutiveSummary;
    onUnlock: (email: string, company: string) => void;
}

export function ScoreGateStep({ data, onUnlock }: ScoreGateStepProps) {
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [loading, setLoading] = useState(false);

    const calculateScore = (waste: number) => Math.round(100 - waste);
    const score = calculateScore(data.executive_summary.waste_percentage);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !company) return;
        setLoading(true);
        // Track the lead and then unlock
        try {
            aurexAPI.trackClick("lead_capture_submit", email);
            onUnlock(email, company);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-white">
            <div className="w-full max-w-2xl space-y-8">
                {/* Score Section */}
                <div className="text-center space-y-4">
                    <div className="mx-auto h-20 w-20 rounded-full border-4 border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                        <span className="text-3xl font-display font-bold text-emerald-400">{score}</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-display font-bold">Token Credit Score: {score}/100</h2>
                        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                            We analyzed {data.total_events.toLocaleString()} spans and identified significant optimization opportunities.
                        </p>
                    </div>
                </div>

                {/* High Level Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
                        <p className="text-xs font-mono uppercase tracking-wider text-red-400 mb-2">Total Waste Identified</p>
                        <p className="text-3xl font-display font-bold text-red-400">${data.executive_summary.wasted_amount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                        <p className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">Projected Annual Savings</p>
                        <p className="text-3xl font-display font-bold text-emerald-400">${data.executive_summary.annual_savings_projection.toLocaleString()}</p>
                    </div>
                </div>

                {/* Blurred Preview */}
                <div className="relative rounded-xl border border-border bg-surface p-6 overflow-hidden">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                        <Lock className="w-8 h-8 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">Unlock Detailed Analysis</h3>
                        <p className="text-sm text-foreground/80 max-w-sm text-center mb-6">
                            Enter your work email to view row-by-row recommendations and export the 5-line SDK fix.
                        </p>
                        
                        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 bg-background p-4 rounded-xl border border-border">
                            <div>
                                <Label htmlFor="email" className="sr-only">Work Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        id="email" 
                                        type="email" 
                                        placeholder="name@company.com" 
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-9 bg-surface border-border text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="company" className="sr-only">Company Name</Label>
                                <Input 
                                    id="company" 
                                    type="text" 
                                    placeholder="Company Name" 
                                    required
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    className="bg-surface border-border text-white"
                                />
                            </div>
                            <Button 
                                type="submit" 
                                disabled={loading || !email || !company}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white"
                            >
                                {loading ? "Unlocking..." : "Unlock Full Report"}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </form>
                    </div>

                    {/* Blurred Content Behind Gate */}
                    <div className="opacity-30 blur-sm select-none pointer-events-none space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="w-4 h-4 text-teal-400" />
                            <span className="font-semibold text-white">Top Inefficiencies Found</span>
                        </div>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex justify-between items-center py-3 border-b border-border">
                                <div>
                                    <p className="font-medium text-white mb-1">Infinite Prompt Loop Detected</p>
                                    <p className="text-xs text-muted-foreground">Identical repeating pattern detected in sequence...</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-red-400 font-mono font-bold">-$420.00/wk</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Your data remains locally processed. We only save your contact info.
                </div>
            </div>
        </div>
    );
}
