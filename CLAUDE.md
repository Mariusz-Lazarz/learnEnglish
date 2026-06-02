# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Hard rules

- Voice audio must never be written to server storage — only text transcripts are persisted.
- AI must stay in English for the entire session — never respond in another language, not even in error messages or corrections.
- AI response audio must start within 3 seconds of the user finishing speaking (target NFR).
- No auth system — single-user app by design; do not add login/session middleware.

## Project

**LearnEnglish** — a voice AI conversation app for a single user. The user speaks via microphone; an AI teacher responds via TTS, stays on topic, and corrects only major errors. Sessions and lessons are persisted in PostgreSQL.

See `context/foundation/prd.md` for the full product spec and `context/foundation/tech-stack.md` for the stack rationale.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run start    # start production server (next start, not serverless)
npm run lint     # ESLint with Next.js rules
```

No test runner is configured yet.

## Architecture

**Framework**: Next.js App Router (`src/app/`). All routes live under `src/app/`; shared code under `src/`.

**Path alias**: `@/*` → `src/*` (see `@tsconfig.json`).

**Planned stack** (not yet wired — see `context/foundation/tech-stack.md`):
- **Vercel AI SDK** — streaming LLM pipeline with SSE
- **shadcn/ui** — component library (typed, accessible)
- **PostgreSQL** (Docker container) — stores lessons and session transcripts
- **Deployment**: `next start` behind nginx + PM2 on a self-hosted VPS (persistent Node.js process, no serverless timeout)
- **CI/CD**: GitHub Actions with auto-deploy on merge to `main`

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
