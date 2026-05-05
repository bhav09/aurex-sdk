export default function PrivacyPolicy() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Privacy Policy</h1>
                <p className="text-sm text-muted-foreground mb-12">Last updated: May 2026</p>

                <div className="space-y-8 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. Introduction</h2>
                        <p>
                            Aurex ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle your data across our Free Audit tool, our SaaS Observability Proxy, and our Inference Financing platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">2. Data Processing by Service Tier</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Free Audit (Local):</strong> If you use our free browser-based audit tool, your CSV and JSON files are processed entirely locally on your device. We do not upload, retain, or access your raw logs, prompts, or tokens.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">SaaS Subscription (Proxy & Observability):</strong> If you route your LLM requests through the Aurex Gateway, we process your API request and response telemetry in transit to provide real-time observability, routing, and caching. We retain usage telemetry (token counts, latency, hashed prompts) for the duration of your subscription to provide the analytics dashboard and calculate your Token Credit Score.
                        </p>
                        <p>
                            <strong className="text-foreground">Inference Financing:</strong> If you apply for Net-30 inference financing, we use your aggregated usage telemetry and Token Credit Score to underwrite your credit risk. 
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. Information Sharing & Stakeholders</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">LLM Providers:</strong> We route your prompts securely to your requested providers (e.g., OpenAI, Anthropic). We do not claim ownership of your prompts, and your data remains subject to the respective provider's privacy policies.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Capital Partners & Trade Credit Insurers:</strong> If you use our Inference Financing, we may share anonymized or aggregated efficiency metrics (your Token Credit Score and token burn rate) with our financial underwriting partners. We never share raw prompt content or proprietary model outputs with these partners.
                        </p>
                        <p>
                            <strong className="text-foreground">Infrastructure Providers:</strong> We use secure, enterprise-grade subprocessors (e.g., Google Cloud Platform) to host the Aurex proxy and process analytics, and Stripe for payment processing.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Information We Collect</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Account & Billing:</strong> Email address, company details, and payment information (processed securely via Stripe).
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Platform Telemetry:</strong> When using the SaaS proxy, we collect request metadata (model name, timestamps, token counts, request duration, error codes) to power your cost dashboard.
                        </p>
                        <p>
                            <strong className="text-foreground">Analytics:</strong> We use privacy-focused analytics to understand how users interact with our marketing site and dashboard.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Data Security</h2>
                        <p>
                            Your data is encrypted in transit (TLS/HTTPS) and at rest. When acting as a proxy, Aurex handles your API keys securely via environment variables or encrypted secret stores, ensuring they are only used to authenticate your requested outbound LLM calls.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">6. Your Rights</h2>
                        <p className="mb-4">You have the right to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Access the telemetry data we have collected about your organization</li>
                            <li>Request deletion of your account and historical observability data</li>
                            <li>Opt-out of optional marketing communications</li>
                            <li>Withdraw consent for data processing (which will terminate your ability to use the SaaS Proxy and Financing features)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">7. Contact Us</h2>
                        <p>
                            If you have questions about this Privacy Policy, our data practices, or how your Token Credit Score is calculated, please contact us at:
                        </p>
                        <p className="mt-4">
                            Email: privacy@aurex.com<br />
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

// Made with Bob
