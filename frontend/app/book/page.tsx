import { Metadata } from "next";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { CalendlyWidget } from "@/components/booking/calendly-widget";
import { Clock, Video, CheckCircle2, Sparkles } from "lucide-react";

export const metadata: Metadata = {
    title: "Book Optimization Call | Aurex",
    description: "Schedule a personalized AI cost optimization consultation with our experts",
};

export default function BookPage() {
    return (
        <div className="min-h-screen bg-background text-white">
            <Navigation />

            <main className="relative pt-32 pb-24 overflow-hidden">
                {/* Background Effects */}
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#2dd4bf]/5 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />

                <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
                    {/* Header */}
                    <div className="mb-20">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="w-12 h-px bg-white/20" />
                            <span className="text-sm font-mono text-white/40">Schedule Consultation</span>
                        </div>

                        <h1 className="text-6xl md:text-7xl lg:text-8xl font-display tracking-tight leading-[0.9] mb-6">
                            <span className="block">Expert</span>
                            <span className="block text-white/30">Optimization</span>
                            <span className="block text-white/10">Guidance</span>
                        </h1>

                        <p className="text-lg text-white/60 max-w-2xl">
                            Get personalized recommendations from our AI cost optimization experts.
                            30-minute focused session on your specific infrastructure.
                        </p>
                    </div>

                    {/* Benefits Grid */}
                    <div className="grid md:grid-cols-3 gap-6 mb-20">
                        <div className="group p-8 border border-white/10 bg-black/40 hover:border-[#2dd4bf]/30 transition-all duration-300">
                            <div className="w-12 h-12 border border-white/10 flex items-center justify-center mb-6 group-hover:border-[#2dd4bf]/30 transition-colors">
                                <Clock className="w-6 h-6 text-white/60" />
                            </div>
                            <h3 className="text-xl font-display mb-3">30-Minute Session</h3>
                            <p className="text-sm text-white/60 leading-relaxed">
                                Focused consultation on your specific AI infrastructure and optimization opportunities
                            </p>
                        </div>

                        <div className="group p-8 border border-white/10 bg-black/40 hover:border-[#2dd4bf]/30 transition-all duration-300">
                            <div className="w-12 h-12 border border-white/10 flex items-center justify-center mb-6 group-hover:border-[#2dd4bf]/30 transition-colors">
                                <Video className="w-6 h-6 text-white/60" />
                            </div>
                            <h3 className="text-xl font-display mb-3">Video Call</h3>
                            <p className="text-sm text-white/60 leading-relaxed">
                                Screen sharing to review your audit results and discuss implementation strategies
                            </p>
                        </div>

                        <div className="group p-8 border border-white/10 bg-black/40 hover:border-[#2dd4bf]/30 transition-all duration-300">
                            <div className="w-12 h-12 border border-white/10 flex items-center justify-center mb-6 group-hover:border-[#2dd4bf]/30 transition-colors">
                                <Sparkles className="w-6 h-6 text-white/60" />
                            </div>
                            <h3 className="text-xl font-display mb-3">Actionable Plan</h3>
                            <p className="text-sm text-white/60 leading-relaxed">
                                Walk away with concrete steps and custom roadmap to reduce your AI costs
                            </p>
                        </div>
                    </div>

                    {/* What We'll Cover */}
                    <div className="mb-20 p-12 border border-white/10 bg-black/40">
                        <div className="flex items-center gap-3 mb-8">
                            <span className="w-8 h-px bg-white/20" />
                            <h2 className="text-3xl font-display">What We'll Cover</h2>
                        </div>

                        <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Deep dive into your audit results and cost breakdown
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Prompt optimization strategies for your specific use cases
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Model selection recommendations (GPT-4 vs Claude vs Gemini)
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Caching and batching implementation guidance
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Custom optimization roadmap for your team
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1 h-1 bg-[#2dd4bf] rounded-full mt-2.5 flex-shrink-0" />
                                <span className="text-white/70 leading-relaxed">
                                    Tool definition refinement and function calling optimization
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Booking Widget */}
                    <div className="border border-white/10 bg-black/40 p-12">
                        <div className="flex items-center gap-3 mb-10">
                            <span className="w-8 h-px bg-white/20" />
                            <h2 className="text-3xl font-display">Select Your Time</h2>
                        </div>

                        <CalendlyWidget />
                    </div>

                    {/* Alternative Contact */}
                    <div className="mt-16 text-center">
                        <p className="text-sm font-mono text-white/40 mb-4">
                            Prefer to schedule via email?
                        </p>
                        <a
                            href="mailto:contact@heyaurex.com?subject=Optimization Call Request"
                            className="text-[#2dd4bf] hover:text-[#2dd4bf]/80 transition-colors font-mono text-sm"
                        >
                            contact@heyaurex.com
                        </a>
                    </div>
                </div>
            </main>

            <FooterSection />
        </div>
    );
}

