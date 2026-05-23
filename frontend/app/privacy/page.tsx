export default function PrivacyPolicy() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Privacy Policy</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

                {/* TL;DR Callout */}
                <div className="mb-12 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
                    <h2 className="text-lg font-bold text-violet-300 mb-3">TL;DR: The Short Version</h2>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                        <li><strong>We do NOT store your prompt text or generated responses</strong> at rest.</li>
                        <li><strong>We do NOT train models</strong> on your data.</li>
                        <li><strong>Free Audit:</strong> Runs 100% locally in your browser. We see nothing.</li>
                        <li><strong>SaaS Proxy:</strong> We temporarily process prompts to route them, and we permanently store only <strong>metadata</strong> (token counts, timestamps, costs).</li>
                        <li><strong>Capital Partners:</strong> Only see anonymized financial health metrics (Token Credit Score). They never see your proprietary usage patterns.</li>
                    </ul>
                </div>

                <div className="space-y-10 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. What We Do (The Process)</h2>
                        <p className="mb-4">
                            Aurex operates across three distinct tiers. Here is exactly how we handle your data in each:
                        </p>
                        <ul className="space-y-4">
                            <li>
                                <strong className="text-foreground">Free Audit:</strong> This tool runs entirely in your local browser. When you upload a CSV or JSON file, the analysis happens on your machine. <strong>No data leaves your computer. Zero storage.</strong>
                            </li>
                            <li>
                                <strong className="text-foreground">SaaS Proxy:</strong> We sit between your application and your chosen LLM provider (e.g., OpenAI). We temporarily process your prompts in transit to route them efficiently and apply caching. We record the metadata of these transactions to populate your observability dashboard.
                            </li>
                            <li>
                                <strong className="text-foreground">Inference Financing:</strong> We use your historical usage efficiency (Token Credit Score) to underwrite a Net-30 credit line. We aggregate your metadata into financial health indicators.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">2. What Is Stored (And What Isn't)</h2>
                        <div className="space-y-6">
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                                <h3 className="font-bold text-emerald-400 mb-2">What We Store</h3>
                                <ul className="list-disc pl-5 space-y-1 text-sm">
                                    <li><strong>Account Details:</strong> Name, email, and company information.</li>
                                    <li><strong>Billing Information:</strong> Processed securely via our payment provider (Stripe).</li>
                                    <li><strong>Telemetry & Metadata:</strong> Token counts, timestamps, model names, latency, error codes, and hashed representations of prompts (used exclusively for caching and deduplication).</li>
                                </ul>
                            </div>
                            
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                                <h3 className="font-bold text-red-400 mb-2">What We GUARANTEE We Do NOT Store</h3>
                                <ul className="list-disc pl-5 space-y-1 text-sm">
                                    <li><strong>Raw Prompts:</strong> We do not store the plain text of your prompts in our database.</li>
                                    <li><strong>LLM Responses:</strong> We do not store the generated text returned by the LLM provider.</li>
                                    <li><strong>Training Data:</strong> We never use your data, prompts, or metadata to train our own AI models.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. Stakeholders & Information Sharing</h2>
                        <p className="mb-4">Here is who has access to what:</p>
                        <ul className="space-y-4">
                            <li>
                                <strong className="text-foreground">LLM Providers (e.g., OpenAI, Anthropic):</strong> When using our proxy, they receive your raw prompts to generate responses. You remain subject to their specific data privacy terms and retention policies.
                            </li>
                            <li>
                                <strong className="text-foreground">Capital Partners & Insurers:</strong> To facilitate Inference Financing, we share <strong>only</strong> anonymized financial health metrics (your Token Credit Score and aggregate token burn rate). They never see your prompt data, metadata, or proprietary usage patterns.
                            </li>
                            <li>
                                <strong className="text-foreground">Infrastructure Providers:</strong> We use Google Cloud Platform (GCP) to securely host the Aurex proxy and process analytics, and Stripe for secure payment processing.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Your Rights</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Access the telemetry metadata we have collected about your organization.</li>
                            <li>Request full deletion of your account and historical observability metadata.</li>
                            <li>Withdraw consent for data processing (Note: this terminates your ability to use the SaaS Proxy and Financing features).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Contact Us</h2>
                        <p>
                            If you have questions about this Privacy Policy, our data practices, or how your Token Credit Score is calculated, please contact us at:
                        </p>
                        <p className="mt-4 font-mono text-sm">
                            Email: contact@heyaurex.com<br />
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
