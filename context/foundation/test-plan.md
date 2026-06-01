# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-01

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/app/session/`, `src/app/api/`,
`src/app/_components/`, `src/app/sessions/`, `src/app/actions/`, `src/db/queries/`,
`src/lib/`. Scope excludes `src/components/ui/` (shadcn/ui generated code).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | AI loses conversation context mid-session — prior turns missing from LLM payload, AI responds as if the conversation just started | High | High | Interview Q1; PRD US-02; hot-spot dir `src/app/session/` (10 commits/30d) |
| 2 | System prompt changes silently break behavioral contract — topic boundary, English-only rule, or error-correction rule missing from the built prompt | High | High | Interview Q3; PRD FR-011, FR-012, FR-014; hot-spot dir `src/lib/` (4 commits/30d) |
| 3 | Voice UI state desync — mic is active during AI playback, or the button state mismatches the actual audio state, leaving the user stuck | Medium | High | Interview Q2; hot-spot dir `src/app/session/` top file 7 commits/30d |
| 4 | Voice pipeline latency exceeds 3s conversational gap — STT + LLM + TTS chain under VPS + nginx conditions exceeds the core NFR | High | Medium | PRD NFR; roadmap F-02 risk note; infrastructure.md pre-mortem (nginx SSE buffering as silent failure) |
| 5 | Audio stored to server — transcribe route writes audio bytes to filesystem, /tmp, or DB before or after the STT call | High | Low | CLAUDE.md hard rule ("voice audio must never be written to server storage"); PRD §Guardrails; hot-spot dir `src/app/api/` (9 commits/30d) |
| 6 | Transcript silently not saved on session end — end-session action swallows an error; session record or transcript is missing with no visible failure | High | Medium | PRD FR-007; hot-spot dir `src/app/actions/` (7 commits/30d) |
| 7 | Session resume re-introduces topic — resumed session loads wrong context shape; AI greets user as if starting a fresh conversation | Medium | Medium | PRD US-02 AC ("AI does not re-introduce the topic"); roadmap S-03; hot-spot dir `src/db/queries/` (4 commits/30d) |

*Risk #4 (latency) is not automatable at the unit/integration layer. It is a required manual release gate documented in §5. Failure to meet the NFR is an ops and provider decision, not a regression in code logic.*

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Prior conversation turns appear in the AI payload in correct order and count for a normal-length session | "context loads" ≠ "correct format for LLM" — verify the messages array content, not just that the query ran | How the context-window module slices history; what the session DB query returns; whether long sessions are silently truncated | Integration: load session → build AI request → assert messages array has expected turns and order | Asserting the context function returns any non-empty array (an array of one empty string passes and is broken) |
| #2 | System-prompt builder output contains topic boundary, English-only instruction, and correction rule for a given lesson input | "prompt looks right in code review" ≠ AI follows it — assert builder output against an independent spec, not against the builder source | What lesson fields feed the prompt; what patterns are required regardless of lesson; where the English-only and correction rules are injected | Unit: call builder with known lesson fixture → assert output contains required behavioral patterns | Copying the expected value from the builder source (oracle problem — mirrors current bugs and can never fail for the right reason) |
| #3 | Mic → recording → transcribing → AI responding → playback → idle state transitions are correct; mic cannot be active during AI playback | "worked in manual testing" ≠ tested; rapid tap and interrupted recording edge cases only appear under real device behavior | What state machine the conversation client uses — explicit FSM or implicit React state? Is the state logic extractable to a pure function? | Unit if state is extractable to a pure function; Playwright e2e for the full voice loop if not extractable | Snapshot testing the conversation component (catches nothing about state transitions) |
| #4 | STT → LLM → TTS delivers first token within 3s under VPS + nginx production conditions | "works on localhost" ≠ "meets NFR on VPS behind nginx" — localhost bypasses nginx SSE buffering entirely | Is `proxy_buffering off` set on the correct nginx location block? Is Vercel AI SDK streaming configured with the correct response type? | Manual smoke test on VPS (required release gate per §5) + static nginx config assertion | Timing the response on localhost and treating it as production evidence |
| #5 | Transcribe route processes audio from the request, calls the STT API, and returns only text — no file write and no audio blob persisted anywhere | "we intended not to store audio" ≠ tested; a well-intentioned implementation may buffer to /tmp or a named path without visible error | What the transcribe route does with the raw audio bytes between receipt and the STT API call; whether any middleware or logging layer writes to disk | Integration: call route with a test audio blob → assert no filesystem writes occur AND the DB write contains only text | Asserting only that the API returns a transcript (does not verify absence of audio storage) |
| #6 | End-session action creates a session record with a non-empty transcript in the DB | "no error thrown" ≠ "transcript saved" — a swallowed exception or wrong table reference leaves no trace and no error | What DB operations the end-session server action performs and in what order; whether failures are surfaced or silently discarded | Integration with real test DB: call end-session → query DB → assert session and transcript records exist and are non-empty | Mocking the DB and asserting the mock was called (does not verify the SQL is correct) |
| #7 | AI context built for a resumed session contains prior messages in the correct format AND the original lesson topic; the system prompt does not carry a fresh-start greeting signal | "data is loaded" ≠ "AI won't re-introduce itself" — depends on how prior turns are formatted AND what the system prompt says about resume | How the context-window module formats prior turns for LLM input; whether it injects a resume signal; what the DB query returns for a session with N prior messages | Integration: load a session with a known transcript → build AI context → assert messages format, count, and that the system prompt lacks a fresh-start trigger | Testing resume by observing the UI response (tests too much at once; cannot isolate the cause of failure) |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Test runner + behavioral contract | Bootstrap Vitest; unit-test system-prompt builder; integration-test transcribe route for audio-storage compliance | #2, #5 | unit, integration | in progress | test-risk6-session-end |
| 2 | Data integrity & session flow | Integration tests with test DB: transcript saved on session end, context loads correctly for in-flight and resumed sessions | #6, #7, #1 | integration | in progress | test-risk6-session-end |
| 3 | Voice UI state machine | Unit-test conversation-client state transitions if extractable; Playwright e2e for the voice loop if not | #3 | unit or e2e | not started | — |
| 4 | Quality gates wiring | Wire Vitest in CI (GitHub Actions); enforce lint + typecheck + unit/integration on every PR | cross-cutting | CI gates | not started | — |

---

## 4. Stack

The classic test base for this project. No test runner is currently configured;
Phase 1 bootstraps Vitest. AI-native tool references carry a `checked:` date
so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see §3 Phase 1 | Natural fit for Next.js + TypeScript + Drizzle ORM; zero-config TS support |
| DB test isolation | postgres.js in-memory / test schema | none yet — see §3 Phase 2 | Phase 2 will verify the isolation strategy for Drizzle + postgres.js |
| API route testing | `@testing-library/react` or Node fetch against route handlers | none yet — see §3 Phase 1 | Next.js App Router route handlers can be called as plain async functions |
| e2e | Playwright | none yet — see §3 Phase 3 | Required only if Phase 3 research finds state is not extractable from the conversation client |
| accessibility | none — out of scope for v1 | — | Single-user app; deprioritized per roadmap |

**Stack grounding tools (current session):**
- Docs: none — Context7 not available in this session; Vitest and Next.js testing recommendations derived from local manifests (package.json, tsconfig) and training knowledge; checked: 2026-06-01
- Search: WebSearch available (deferred tool) — not used; local evidence sufficient for initial phase scoping; checked: 2026-06-01
- Runtime/browser: none — no Playwright MCP or browser tool available; Phase 3 will evaluate need during research; checked: 2026-06-01
- Provider/platform: GitHub Actions present (`.github/workflows/deploy.yml`) — CI gate wiring target for Phase 4; checked: 2026-06-01

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is not enforced until that rollout
phase lands.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required now (`npm run lint`, `npm run typecheck` already in scripts) | syntactic and type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions in system-prompt builder, route handlers, server actions |
| e2e on voice loop | CI on PR | required after §3 Phase 3 (conditional — only if Playwright is adopted) | broken voice UI state transitions |
| quality gates wired in CI | CI on PR | required after §3 Phase 4 | any regression that slips past local gates |
| manual VPS smoke test (latency) | VPS before production release | required as release gate (Risk #4) | STT + LLM + TTS chain latency under real nginx + PM2 conditions; not automatable |
| post-edit hook (lint/typecheck) | local agent loop | recommended after §3 Phase 4 | regressions at edit time before commit |
| visual diff / multimodal review | CI | not planned — see §7 | appearance regressions are out of scope per interview Q5 |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test (system-prompt or pure function)

TBD — see §3 Phase 1. Pattern will cover: testing the system-prompt builder
output against an independent behavioral spec (English-only, topic boundary,
correction rule) without reusing the builder's own values as expected output.

### 6.2 Adding an integration test (API route)

TBD — see §3 Phase 1. Pattern will cover: calling a Next.js App Router route
handler as an async function in Vitest, asserting response shape and
side-effect absence (specifically: no audio storage for the transcribe route).

### 6.3 Adding an integration test (DB-dependent server action)

Established by `test-risk6-session-end` (Phase 2, 2026-06-01).

**Test file location**: `src/app/actions/__tests__/<name>.integration.test.ts`

**Required imports**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { <actionUnderTest> } from '@/app/actions/<module>';
import { createSession, getSessionById, getTranscriptMessages } from '@/db';
import { db } from '@/db';
import { sessions, transcripts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { truncateAll, getTranscriptRow } from '@/test/helpers';
```

Use `truncateAll` and `getTranscriptRow` from `@/test/helpers`. Import schema
objects directly for assertions that need raw table access beyond what the
query helpers expose.

**`beforeEach` pattern**:
```typescript
beforeEach(async () => {
  await truncateAll();
});
```

`truncateAll()` deletes all `sessions` rows; `ON DELETE CASCADE` on
`transcripts.session_id` removes transcript rows automatically. Do not mock
the DB — mocking lies about constraint violations and cascades.

**Assertion shape**: call the action, then query the DB directly and assert
both the primary record and any child records with specific content.

```typescript
it('saves the transcript and sets ended_at', async () => {
  const session = await createSession();
  const result = await endSessionAction(session.id, testMessages);
  expect(result).toBeUndefined();                              // no error
  const saved = await getSessionById(session.id);
  expect(saved?.endedAt).not.toBeNull();                       // ended_at set
  const messages = await getTranscriptMessages(session.id);
  expect(messages).toHaveLength(testMessages.length);          // content saved
  expect(messages[0].content).toBe(testMessages[0].content);
});
```

For presence without content (e.g., zero-turn session), use `getTranscriptRow`
to assert the row exists even when `getTranscriptMessages` returns `[]`:
```typescript
const row = await getTranscriptRow(session.id);
expect(row).not.toBeNull();
```

**Avoid-mocking rule**: asserting that a mock DB method was called does NOT
verify the SQL is correct and does NOT catch constraint violations or cascades.
Always use the real test DB (schema `test_data` on `db_a208`).

### 6.4 Adding an e2e test for a voice UI flow

TBD — see §3 Phase 3 (conditional on research finding that state is not
extractable from the conversation client).

### 6.5 Adding a test for context or session resume logic

TBD — see §3 Phase 2. Pattern will cover: loading a fixture session with
a known transcript, building the AI context payload, and asserting the
messages array shape and the system-prompt resume signal.

### 6.6 Per-rollout-phase notes

*(Filled in as phases ship.)*

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI appearance and visual layout** — the app must work correctly, not look a certain way. No snapshot tests, no CSS regression tests, no style assertions. Re-evaluate if the product adds a design system or becomes multi-user. (Source: Phase 2 interview Q5.)
- **shadcn/ui generated components** — these are authored by the shadcn CLI, not by hand; churn in `src/components/ui/` is scaffolding noise. Re-evaluate if a component is meaningfully forked from the generated source. (Source: hot-spot scan scope exclusion, Phase 1.)
- **v2 deferred features (FR-015, FR-016)** — end-of-session mistake summary and topic suggestions are explicitly out of scope for v1 per PRD §Non-Goals. No tests should be written for these paths. Re-evaluate when the roadmap promotes them to v1.
- **Admin / internal tooling** — no admin surface exists; excluded by single-user design.

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-01
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: 2026-06-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
