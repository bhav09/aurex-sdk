# Aurex Product Specification & System Architecture

Aurex is a SaaS-backed AI cost optimization system that acts as an active budget circuit-breaker and passive waste auditor.

## Platform Goals

1. **Lead Capture & Verification**: Protect user registration from bot spam and dummy emails using deliverability DNS MX checks, while automatically logging lead metadata on audit completion.
2. **Defensible Savings Realization**: Present clear dollar-denominated savings dashboards showing return-on-investment after applying recommended optimization rules.
3. **High-Accuracy Clustering**: Prevent concurrency-based false positive agent loop detection by employing multi-dimensional temporal clustering buckets.
4. **Negotiated Rate Overrides**: Support enterprise JSON uploads to map custom per-model pricing rather than defaulting to public catalog lists.
5. **Real-time Circuit Breaking**: Empower SDKs to act as guards that warn or interrupt runaway agents prior to downstream token depletion.

---

## Key Backend Implementations

### Email Verification System
The OTP registration endpoint enforces email validation:
- **Blocklist**: Prevents signups with dummy domains (e.g. `example.com`, `test.com`, `tempmail.com`).
- **MX Records**: Verifies valid mail servers exist on the target domain using DNS validation.
- **Testing bypass**: Automatically disables DNS lookups in Pytest contexts (`PYTEST_CURRENT_TEST`).

### Ingestion & Analysis Heuristics
Aurex analyzes ingestion streams across seven vectors:
- **System Prompt Waste**: Repeated redundant transmission of system templates.
- **Agent Loops**: Exponential context size increases across a session.
- **Expensive Model Misuse**: Premium models selected for minor tasks.
- **Context Explosion**: Sudden context spikes without sliding windows.
- **Tool Bloat**: Declaring large numbers of tool parameters without utilizing them.
- **Retry Cascade Loops**: Rapid, repeated identical calls following 5xx error statuses.
- **Output Verbosity**: Conversational fluff adding extra cost to outputs.
