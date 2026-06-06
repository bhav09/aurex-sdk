Let me first fetch the current site structure properly before making any recommendations.

Now I have a complete picture of every existing page and its current content. Let me do a thorough analysis.

Now I have a complete picture — all three existing pages (`/`, `/docs`, `/audit`), their exact content, and the full repositioning context from our entire conversation. Let me build the comprehensive UI change specification.

Now I have everything I need — all three live pages scraped completely, the full repositioning context, and the target aesthetic from six reference platforms. Let me build this as a comprehensive, actionable specification.

Three things stand out as most actionable from this full audit, and worth calling out beyond the table.

    

The single most damaging thing on the current site is the contradiction on the docs page. The zero-PII promise is in the sidebar as a trust badge — "Prompts and responses are SHA-256 hashed locally. Plaintext never leaves your machine" — and then two scrolls down, the Method A code example passes `prompt="Generate a response about pricing."` directly to `auditor.log_event()`. Any security-conscious engineer at a fintech or healthcare company — exactly the customer Aurex is best positioned to win — will see that and close the tab. Fixing this inconsistency costs zero design work and should happen today, before any visual changes.

The second highest-leverage single change is the `/audit` page deletion combined with promoting `patch_all()` as the hero CTA on the docs page. Right now the primary call-to-action on the homepage is "Run Free Audit," which points to a form that asks for your name, email, company, and a file upload before showing you anything. Raindrop, Langfuse, Arize, Braintrust — none of them gate first value behind a form. They all get you to a working SDK or a live dashboard within 90 seconds. The moment you change the primary CTA to "Install SDK free → `/docs#quickstart`", you shorten the time-to-value from "fill a form, upload a file, wait" to "run one pip command, see a detection fire in your terminal." That is the conversion change that matters most.

The third observation is architectural rather than visual: the docs page is currently a single scrolling page, which is fine for a weekend project but signals immaturity to the AI Engineer persona. Langfuse, Langsmith, and Arize all use a three-panel layout — left sidebar with full nav tree, centre content pane, right anchor-link sidebar — because their documentation has enough depth to need it. Aurex's docs aren't there yet in terms of content volume, but the layout should be built now so that as PromptIQ, CascadeRouter, and ProviderShield documentation gets added, it has a home that doesn't require a full redesign. The dark mode toggle belongs in the nav of this three-panel layout, not retrofitted later.

That's a completely valid reason to keep it — lead gen funnels are sacred, especially at the pre-revenue or early-revenue stage. The question isn't whether to keep the audit flow, it's whether the current implementation of that flow is doing the best possible job as a lead gen funnel, and right now it has some real friction points that are probably hurting conversion.

Let me reframe the thinking here, because "keep the audit page" and "fix the mental model problem" are not mutually exclusive goals.

---

## The real problem with /audit isn't that it exists — it's where it sits in the journey

Right now "Run Free Audit" is the **primary hero CTA** on the homepage. That means the very first thing a new visitor is asked to do is upload a CSV file — before they've understood what Aurex is, before they've seen a single detection example, before they feel any urgency about the problem. That's asking for commitment before building desire.

Think of it the way a good landing page conversion funnel works: you move people from Awareness → Interest → Desire → Action. Right now the CTA jumps straight to Action (upload your data) skipping all three prior stages. The visitor hasn't been made to feel the pain of token waste yet, so uploading a file feels like work rather than relief.

The fix isn't deleting `/audit` — it's repositioning it as the **conversion endpoint** of the homepage journey rather than the entry point. Here's the precise change:

The **primary hero CTA** becomes "Install SDK free" (targets AI Engineers who will self-serve and become your best word-of-mouth). The **secondary hero CTA** becomes "Run free audit" — same page, same button, just demoted from position 1 to position 2. This single change means the audit is still prominently offered, but only after the visitor has read the hero headline, subheadline, and stats that make them feel the urgency of the problem.

---

## The audit page itself needs two specific fixes to convert better

The current `/audit` page has a form that asks for name, email, company, Google SSO — **before** showing the upload interface. This is a classic lead gen mistake called "value before capture" — you should show the file upload immediately, let the user experience the drag-and-drop and see the analysis begin, and then ask for their email to receive the full report. This is exactly how tools like Canva's free design tool, Carbon's code screenshot tool, and Loom's free recorder work — you get partial value first, then the email wall appears at the point where you want to keep or share the output.

The specific recommendation for the audit flow is therefore:

**Step 1 (no gate):** Land on `/audit` and see the upload interface immediately. No form, no SSO, no friction. Just a clean drag-and-drop zone with the text "Drop your LLM usage logs here — CSV or JSON" and a "what columns does my file need?" expandable hint.

**Step 2 (partial value, still no gate):** After upload, show a teaser result — the Token Credit Score number (e.g. "67/100") and the top two findings as blurred/locked cards with labels visible ("Agent Runaway Loop detected" and "System Prompt Redundancy — potential $X/month saving") and a clear "Unlock full report" prompt.

**Step 3 (email capture at peak desire):** The email/name/company form appears only at this moment — when the user can see they have findings waiting and wants to read them. At this point they are highly motivated to give you their details. This is your lead gen moment, and it happens when conversion intent is at its peak rather than at zero.

This structure converts far better than the current flow because you're capturing the lead at the moment of maximum perceived value, not at the moment of zero value. The company name and role fields (which currently appear before the user has seen anything) can still be there — they just appear after the score is revealed, so the user fills them in willingly because they want the full report.

---

## What this means for the homepage CTA strategy

The revised CTA hierarchy for the homepage should be:

The primary button reads "Install SDK free" and goes to `/docs#quickstart`. This serves your AI Engineer and AIOps personas who want to self-serve and integrate immediately — they are your highest-quality leads because they will actually use the product and generate word-of-mouth.

The secondary button reads "Run free audit →" and goes to `/audit`. This serves the startup founder or AI team lead who hasn't instrumented their app yet but has billing data they can export from OpenAI's usage dashboard. This is your volume lead gen funnel — lower intent than the SDK install path, but higher volume.

Both CTAs serve different buyer personas, and both are still prominently on the homepage. The only thing that changed is that "Install SDK free" moved to the primary position, which is appropriate because it signals a more serious, production-grade tool — which is exactly the perception shift the repositioning is trying to create.

The one other thing worth adding to the audit page is a clear "don't have logs yet?" escape hatch that links directly to the SDK quickstart. Some visitors will land on `/audit` via a referral or search, realize they don't have a CSV to upload, and currently have nowhere to go. Giving them a path to the SDK install converts that dead end into a second lead gen channel.