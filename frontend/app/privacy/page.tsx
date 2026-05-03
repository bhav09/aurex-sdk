export default function PrivacyPolicy() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Privacy Policy</h1>
                <p className="text-sm text-muted-foreground mb-12">Last updated: April 2026</p>

                <div className="space-y-8 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. Introduction</h2>
                        <p>
                            Aurex ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle your data when you use our AI cost optimization audit service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">2. Data Processing</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Local Processing:</strong> All file analysis happens entirely in your browser. Your CSV and JSON files are processed locally on your device and never uploaded to our servers.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">No Data Retention:</strong> We do not store, retain, or have access to your audit data, logs, or any information contained in the files you analyze.
                        </p>
                        <p>
                            <strong className="text-foreground">Zero Server Upload:</strong> Your sensitive AI usage data, prompts, tokens, and cost information remain on your device at all times.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. Information We Collect</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Analytics:</strong> We use privacy-focused analytics to understand how users interact with our service (page views, button clicks, general usage patterns). This data is anonymized and does not include any of your audit data.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Contact Information:</strong> If you choose to contact us or book a consultation, we collect your email address and any information you voluntarily provide.
                        </p>
                        <p>
                            <strong className="text-foreground">Payment Information:</strong> For paid services, payment processing is handled by third-party providers (Stripe). We do not store your credit card information.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Compliance with AI Provider Terms</h2>
                        <p className="mb-4">
                            Our service is designed to help you optimize your usage of AI services from providers like OpenAI, Anthropic, and Google. We comply with their terms of service:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>We do not access, store, or transmit your API keys</li>
                            <li>We do not intercept or modify your API calls to these providers</li>
                            <li>We analyze only the data you explicitly choose to upload for audit purposes</li>
                            <li>We respect the data handling requirements of all major AI providers</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Data Security</h2>
                        <p>
                            Since your data never leaves your browser, it benefits from your device's security measures. We use industry-standard security practices for our website infrastructure, including HTTPS encryption for all connections.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">6. Your Rights</h2>
                        <p className="mb-4">You have the right to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Request information about any data we may have collected</li>
                            <li>Request deletion of your contact information</li>
                            <li>Opt-out of analytics tracking</li>
                            <li>Withdraw consent for data processing at any time</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">7. Third-Party Services</h2>
                        <p className="mb-4">We use the following third-party services:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong className="text-foreground">Analytics:</strong> Privacy-focused analytics for usage statistics</li>
                            <li><strong className="text-foreground">Hosting:</strong> Vercel for website hosting</li>
                            <li><strong className="text-foreground">Payments:</strong> Stripe for payment processing (paid plans only)</li>
                        </ul>
                        <p className="mt-4">
                            These services have their own privacy policies and data handling practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">8. Children's Privacy</h2>
                        <p>
                            Our service is not intended for users under 18 years of age. We do not knowingly collect information from children.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">9. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last updated" date at the top of this policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">10. Contact Us</h2>
                        <p>
                            If you have questions about this Privacy Policy or our data practices, please contact us at:
                        </p>
                        <p className="mt-4">
                            Email: privacy@aurix.ai<br />
                            Website: aurix.ai
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
