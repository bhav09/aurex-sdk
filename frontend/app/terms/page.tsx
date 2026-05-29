export default function TermsAndConditions() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Terms and Conditions</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

                {/* TL;DR Callout */}
                <div className="mb-12 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6">
                    <h2 className="text-lg font-bold text-sky-300 mb-3">TL;DR: The Short Version</h2>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                        <li><strong>Aurex is a pass-through proxy.</strong> We are not responsible for the content you generate.</li>
                        <li><strong>You must follow LLM provider rules.</strong> You are bound by the Acceptable Use Policies (AUP) of OpenAI, Anthropic, etc.</li>
                        <li><strong>Paid tier billing.</strong> Failing to pay your subscription invoice will result in proxy service suspension.</li>
                    </ul>
                </div>

                <div className="space-y-10 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. Clear Stakeholder Responsibilities</h2>
                        <ul className="space-y-4">
                            <li>
                                <strong className="text-foreground">Aurex's Responsibility:</strong> We are responsible for maintaining control plane proxy uptime, calculating optimization metrics based on telemetry, and securing your metadata and API keys in transit.
                            </li>
                            <li>
                                <strong className="text-foreground">Your Responsibility (The User):</strong> You are solely responsible for complying with the underlying LLM provider's Acceptable Use Policy (AUP). Aurex is a pass-through; if you generate illegal content, violate copyright, or abuse rate limits, the liability rests entirely with you.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. Pass-Through Liability & AI Provider Terms</h2>
                        <p className="mb-4">
                            Aurex acts as a routing and observability proxy between your application and third-party LLM providers. You acknowledge and agree that:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>You are strictly bound by the terms of the underlying AI providers you access through Aurex.</strong></li>
                            <li>Aurex takes <strong>no liability</strong> for the content, prompts, or outputs generated through your use of the proxy.</li>
                            <li>If an AI provider flags your usage, suspends your API keys, or terminates your access due to AUP violations, Aurex bears no responsibility for resulting downtime or data loss.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Intellectual Property</h2>
                        <p>
                            The Service, including its design, code, proxy algorithms, and Token Credit Score methodology, is owned by Aurex. You retain all rights to your application code and generated outputs.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Disclaimers and Limitations of Liability</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Service Availability:</strong> We aim for high availability but do not guarantee uninterrupted access. The Service is provided "as is" without warranties.
                        </p>
                        <p>
                            <strong className="text-foreground">Limitation of Liability:</strong> To the maximum extent permitted by law, Aurex shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including lost profits or lost data due to proxy downtime or AI provider outages.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">6. Contact Information</h2>
                        <p>
                            For legal inquiries regarding these Terms, please contact us at:
                        </p>
                        <p className="mt-4 font-mono text-sm">
                            Email: legal@aurex.com<br />
                            Website: www.heyaurex.com
                        </p>
                    </section>
                </div>

                <div className="mt-16 pt-8 border-t border-foreground/10">
                    <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ← Back to Home
                    </a>
                </div>
            </div>
        </main>
    );
}
