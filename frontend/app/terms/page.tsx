export default function TermsAndConditions() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-6 py-20">
                <h1 className="text-5xl font-display mb-8">Terms and Conditions</h1>
                <p className="text-sm text-muted-foreground mb-12">Last updated: January 2025</p>

                <div className="space-y-8 text-muted-foreground leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">1. Acceptance of Terms</h2>
                        <p>
                            By accessing and using Aurix's AI cost optimization audit service ("Service"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">2. Description of Service</h2>
                        <p className="mb-4">
                            Aurix provides a browser-based tool that analyzes your AI usage logs (CSV/JSON files) to identify cost optimization opportunities. The Service includes:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Local file analysis (no server upload)</li>
                            <li>Cost optimization recommendations</li>
                            <li>Token usage analytics</li>
                            <li>Prompt and tool definition optimization consulting (paid service)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">3. User Responsibilities</h2>
                        <p className="mb-4">You agree to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Provide accurate information when using our Service</li>
                            <li>Comply with all applicable laws and regulations</li>
                            <li>Not use the Service for any unlawful or prohibited purpose</li>
                            <li>Not attempt to reverse engineer, decompile, or extract source code</li>
                            <li>Ensure you have the right to analyze the data you upload</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">4. Compliance with AI Provider Terms</h2>
                        <p className="mb-4">
                            Our Service is designed to help you optimize your usage of AI services from providers including OpenAI, Anthropic, and Google. You acknowledge that:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You remain responsible for compliance with your AI provider's terms of service</li>
                            <li>Our recommendations do not guarantee compliance with third-party terms</li>
                            <li>You should review and comply with OpenAI's Usage Policies, Anthropic's Acceptable Use Policy, and Google's AI Terms of Service</li>
                            <li>We do not access your API keys or make API calls on your behalf</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">5. Data Processing and Privacy</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Local Processing:</strong> All file analysis occurs in your browser. We do not upload, store, or access your audit data.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Your Data Ownership:</strong> You retain all rights to your data. We claim no ownership over the files you analyze.
                        </p>
                        <p>
                            For more details, please review our <a href="/privacy" className="text-foreground underline">Privacy Policy</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">6. Free and Paid Services</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">Free Tier:</strong> Basic audit functionality is provided free of charge with no credit card required.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Paid Services:</strong> Advanced optimization consulting, custom integrations, and enterprise features require payment. Pricing is available on our website.
                        </p>
                        <p>
                            <strong className="text-foreground">Refunds:</strong> Refund policies are outlined at the time of purchase. Generally, consulting services are non-refundable once delivered.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">7. Intellectual Property</h2>
                        <p className="mb-4">
                            The Service, including its design, code, algorithms, and content, is owned by Aurix and protected by intellectual property laws. You may not:
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Copy, modify, or distribute our Service</li>
                            <li>Use our branding without permission</li>
                            <li>Create derivative works based on our Service</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">8. Disclaimers and Limitations</h2>
                        <p className="mb-4">
                            <strong className="text-foreground">No Guarantees:</strong> While we strive for accuracy, we do not guarantee specific cost savings or results. Actual savings depend on your implementation of our recommendations.
                        </p>
                        <p className="mb-4">
                            <strong className="text-foreground">Service Availability:</strong> We aim for high availability but do not guarantee uninterrupted access. The Service is provided "as is" without warranties.
                        </p>
                        <p>
                            <strong className="text-foreground">Limitation of Liability:</strong> To the maximum extent permitted by law, Aurix shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">9. Third-Party Services</h2>
                        <p>
                            Our Service may integrate with or reference third-party services (OpenAI, Anthropic, Google, etc.). We are not responsible for these third-party services, and your use of them is subject to their respective terms and conditions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">10. Termination</h2>
                        <p>
                            We reserve the right to terminate or suspend access to our Service at any time, with or without cause, with or without notice. You may stop using the Service at any time.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">11. Changes to Terms</h2>
                        <p>
                            We may modify these Terms at any time. Material changes will be communicated via email (for registered users) or by updating the "Last updated" date. Continued use of the Service after changes constitutes acceptance of the new Terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">12. Governing Law</h2>
                        <p>
                            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Aurix operates, without regard to its conflict of law provisions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">13. Contact Information</h2>
                        <p>
                            For questions about these Terms, please contact us at:
                        </p>
                        <p className="mt-4">
                            Email: legal@aurix.ai<br />
                            Website: aurix.ai
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-display text-foreground mb-4">14. Severability</h2>
                        <p>
                            If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
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
