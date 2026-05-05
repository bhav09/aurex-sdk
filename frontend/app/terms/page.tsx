export default function TermsAndConditions() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Terms and Conditions</h1>
                <p className="text-sm text-muted-foreground mb-12">Last updated: May 2026</p>

                <div className="space-y-8 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. Acceptance of Terms</h2>
                        <p>
                            By accessing and using Aurex's Free Audit, SaaS Proxy, or Inference Financing services ("Service"), you agree to be bound by these Terms and Conditions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">2. Description of Services</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Free Audit:</strong> A local, browser-based tool to analyze offline usage logs for cost optimization.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">SaaS Subscription (Aurex Gateway):</strong> A managed proxy service providing real-time cost observability, prompt caching, and token analytics for your API calls.
                        </p>
                        <p>
                            <strong className="text-foreground">Inference Financing:</strong> A credit facility offering Net-30 payment terms on your AI usage, with rates determined dynamically by your Token Credit Score.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. User Responsibilities & Acceptable Use</h2>
                        <p className="mb-4">You agree to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Provide accurate organizational and billing information</li>
                            <li>Comply with all applicable laws and regulations</li>
                            <li>Not use the Service to circumvent rate limits or abuse AI provider infrastructure</li>
                            <li>Not use the Service for any unlawful or prohibited purpose</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Pass-Through Liability & AI Provider Terms</h2>
                        <p className="mb-4">
                            Aurex acts as a routing and observability proxy between your application and third-party LLM providers (e.g., OpenAI, Anthropic, Google). You acknowledge and agree that:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>You are strictly bound by the Acceptable Use Policies (AUP) and Terms of Service of the underlying AI providers you access through Aurex.</strong></li>
                            <li>Aurex takes <strong>no liability</strong> for the content, prompts, or outputs generated through your use of the proxy.</li>
                            <li>If an AI provider flags your usage, suspends your API keys, or terminates your access due to AUP violations, Aurex bears no responsibility for resulting downtime or data loss.</li>
                            <li>You are solely responsible for ensuring your prompts and generated content do not violate third-party policies regarding harm, illegal acts, or misuse.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Financing & Credit Terms</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Token Credit Score:</strong> Your financing rate (typically 3-5%) is dynamic and based on our proprietary Token Credit Score, derived from your historical usage efficiency. We reserve the right to adjust this score and your resulting rate at our sole discretion based on ongoing analytics.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Payment Obligations:</strong> By opting into Inference Financing, you agree to pay all accrued inference costs plus the liquidity fee on a strict Net-30 schedule. Failure to pay may result in immediate suspension of proxy services, and we reserve the right to report defaults to relevant credit bureaus or our capital partners.
                        </p>
                        <p>
                            <strong className="text-foreground">Underwriting:</strong> We reserve the right to deny financing or revoke credit limits at any time based on algorithmic risk assessment or business health indicators.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">6. Data Processing and Privacy</h2>
                        <p className="mb-4">
                            Our data handling practices, including how we process telemetry for the Token Credit Score and share aggregated data with capital partners, are outlined in our <a href="/privacy" className="text-foreground underline">Privacy Policy</a>. By using our Services, you consent to these practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">7. Intellectual Property</h2>
                        <p className="mb-4">
                            The Service, including its design, code, proxy algorithms, and Token Credit Score methodology, is owned by Aurex. You retain all rights to your prompts, application code, and generated outputs.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">8. Disclaimers and Limitations of Liability</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Service Availability:</strong> We aim for high availability but do not guarantee uninterrupted access. The Service is provided "as is" without warranties.
                        </p>
                        <p>
                            <strong className="text-foreground">Limitation of Liability:</strong> To the maximum extent permitted by law, Aurex shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including lost profits or lost data due to proxy downtime or AI provider outages.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">9. Termination</h2>
                        <p>
                            We reserve the right to terminate or suspend your access to the proxy or financing services at any time, particularly for non-payment or violations of our or underlying provider terms. You may cancel your SaaS subscription at any time, but you remain liable for any outstanding financed balances.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">10. Contact Information</h2>
                        <p>
                            For legal inquiries regarding these Terms, please contact us at:
                        </p>
                        <p className="mt-4">
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

// Made with Bob
