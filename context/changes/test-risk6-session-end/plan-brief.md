# Risk #6 — Transcript Persistence on Session End: Plan Brief

> Full plan: `context/changes/test-risk6-session-end/plan.md`
> Research: `context/changes/test-risk6-session-end/research.md`

## What & Why

Bootstrap Vitest, stand up a real-DB integration test environment, and fix a confirmed production bug: `endSessionAction` does not save the transcript. The original implementation contract (`context/changes/first-voice-conversation/plan.md:61`) designated `endSessionAction` as the final authoritative save, but the implementation dropped the `messages` parameter and never called `saveTranscript`. A session can end with `endedAt` set and no transcript row — no error, no visible failure, FR-007 violated.

## Starting Point

No test runner is configured; `vitest` is absent from `package.json`. `endSessionAction` (`src/app/actions/sessions.ts:48–56`) performs one operation: `UPDATE sessions SET ended_at = now()`. It never calls `saveTranscript`. The only transcript writes are fire-and-forget per-turn saves that silently swallow all errors.

## Desired End State

`npm test` runs Vitest and exits 0 with two integration tests covering `endSessionAction`: one that proves transcript + session record are both saved with correct content, and one that covers the zero-turn edge case. `endSessionAction` has the restored signature `(sessionId, messages)`, calls `saveTranscript` before `endSession`, and the `ConversationClient` passes its `messages` state at session end. `test-plan.md §6.3` is filled with the reusable DB integration test recipe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Vitest scope | Include Vitest bootstrap in this plan | Creates a self-contained, runnable plan with no blocking Phase 1 prerequisite | Plan |
| Test sequencing | TDD: RED test first, then fix | Failing test is living proof of the bug; fix is validated by the same test | Plan |
| Fix approach | Restore `endSessionAction(sessionId, messages)` | Matches the original contract exactly; caller already holds the full messages state | Research (plan.md:61, 92–96) |
| Test DB isolation | Dedicated test DB + `beforeEach` truncation | Real postgres with real constraints — UNIQUE INDEX and CASCADE behave as in production | Plan |
| Zero-turn handling | Always save transcript row (even `messages=[]`) | Guarantees every ended session has a `transcripts` row; consistent query logic | Plan |

## Scope

**In scope:**
- Vitest installation and configuration
- `src/test/helpers.ts` — `truncateAll()` and `getTranscriptRow()` utilities
- Integration tests for `endSessionAction` (happy path + zero-turn edge case)
- Fix to `endSessionAction` and `ConversationClient` call site
- `test-plan.md §6.3` cookbook + §3 phase status update

**Out of scope:**
- Test-plan Phase 1 risks (#2 system-prompt builder, #5 transcribe route) — separate change
- Risks #7 and #1 (session resume, AI context) — later Phase 2 work
- CI/CD wiring for the test suite — test-plan Phase 4
- Mocking the DB in any test

## Architecture / Approach

Vitest runs in Node.js environment. The existing `src/db/client.ts` singleton reads `DATABASE_URL` at module load time; setting that to a test DB URL in `.env.test` is all that's needed to redirect all DB operations to the test DB. `beforeEach` calls `DELETE FROM sessions` — the `ON DELETE CASCADE` on `transcripts.session_id` cleans transcript rows automatically. Tests import the real server action and real query functions; no mocking. The fix is a two-line change: add `messages: Message[]` param and prepend `await saveTranscript(sessionId, messages)` to the action body.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest + Test DB | `npm test` runs; smoke test confirms DB connectivity | `next/cache` import may fail outside Next.js runtime — needs a `vi.mock` stub if so |
| 2. RED test | Failing test proves the bug exists; TypeScript error on unknown argument | Failure must be on the action call, not on DB setup — Phase 1 must be solid first |
| 3. GREEN + edge cases | Fixed `endSessionAction`; both tests pass; call site updated | `messages` state at session end may be stale if TTS is still running — verify timing |
| 4. Cookbook sync | `test-plan.md §6.3` filled; rollout statuses updated | None — read-only change to docs |

**Prerequisites:** Running postgres instance accessible from the dev machine; `TEST_DATABASE_URL` pointing to a dedicated test DB with migrations applied.
**Estimated effort:** ~1 session across 4 phases. Phases 1–3 are the work; Phase 4 is 15 minutes.

## Open Risks & Assumptions

- `next/cache` (`revalidatePath`) is imported in `sessions.ts`; if Next.js 16's module throws on import outside a runtime, a `vi.mock` stub is needed in `src/test/setup.ts`. Check `node_modules/next/dist/docs/` before implementing Phase 1.
- The fix passes `messages` from the client's React state at the moment "End session" is confirmed. If the user clicks "End session" mid-TTS, the last assistant turn may not yet be in `messages`. This pre-existing race condition is unchanged by this plan; the TDD test uses known fixtures, so it will not surface it.

## Success Criteria (Summary)

- `npm test` exits 0 with two integration tests covering `endSessionAction`
- Dev end-to-end verified: start a session, say one message, end it, check `/sessions` shows message count = 1
- `test-plan.md §6.3` is a standalone, reusable recipe for the next DB integration test (Risk #7)
