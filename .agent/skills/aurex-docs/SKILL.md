---
name: aurex-docs
description: >-
  Concise, plain-English, step-by-step documentation skill for Aurex. Activate
  whenever writing or updating README.md, reason.md, llms.txt, SDK READMEs, or
  Next.js frontend/app/docs pages.
---

# Aurex Concise Documentation Skill

Use this skill whenever creating or editing any Aurex documentation (`README.md`, `reason.md`, `frontend/public/llms.txt`, `sdk/*/README.md`, and `frontend/app/docs/**`).

## 1. Writing Style Rules

- **Simple Everyday English:** Write so a developer or engineering lead understands it in one read. If a technical term is needed (e.g., "prefix cache TTL" or "200k cliff"), explain it in one plain sentence right away.
- **Short & Step-by-Step:** Cut long essays, marketing fluff, and repetitive tables. Keep doc pages under ~120 lines and use numbered steps (`Step 1`, `Step 2`, `Step 3`) with copy-pasteable Python and Node.js snippets.
- **One Storyline Everywhere:** Frame all docs around Aurex's single 3-stage call lifecycle:
  1. **Before the Call (Stage 1):** Prefix Cache-Shield & `200k` Cliff Guard.
  2. **During the Call (Stage 2):** Session-Isolated Spend, Thinking & Stream Circuit Breaker.
  3. **After the Call + CI (Stage 3):** Verified Cost-Per-Outcome & Soft-Failure Gate.
- **No Unbuilt Claims:** Never mention MCP wrapping, ONNX/`AurexCompressor`, or LLMLingua-2. Only document features that exist and pass smoke tests.

## 2. Mandatory 4-Pointer Structure

Every primary doc (`README.md` and each core `/docs` guide) MUST clearly answer these four questions in order:

1. **What problems are people facing?**
   - 2–4 short bullets naming the real pain (e.g., silent timestamp edits breaking 90% cache discounts, crossing `200k` tokens doubling the whole request bill, hidden thinking tokens/aborted streams burning budget, HTTP-200 empty/looped responses still billing).
2. **What does Aurex solve?**
   - 2–3 plain sentences explaining exact protection and dollar outcome without proxy latency or sending raw prompts out of the VPC.
3. **How to use it (Step-by-Step)?**
   - Numbered copy-paste setup (`Install` -> `Enable / Configure` -> `Verify`) showing both **Python** and **Node.js**.
4. **How can you improve your setup?**
   - 3–4 practical, high-leverage next tweaks based on what Aurex flags (e.g., moving dynamic dates to the end of prompts, setting `thinking` token caps, enabling Redis for multi-worker pods, calling `mark_success()` + `aurex ci` on PRs).

## 3. Verification Checklist Before Finishing Docs

- Check `frontend/public/llms.txt` and `frontend/components/docs/docs-nav.ts` match all live `/docs` routes.
- Ensure every code snippet uses real, current method names and imports from `aurex_sdk` (Python) and `aurex-sdk` (Node).
