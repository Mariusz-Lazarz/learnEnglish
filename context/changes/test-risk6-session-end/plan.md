# Risk #6 — Transcript Persistence on Session End: Implementation Plan

> Research: `context/changes/test-risk6-session-end/research.md`
> Test plan: `context/foundation/test-plan.md` §2 Risk #6 · §3 Phase 2

## Overview

Bootstrap Vitest, establish a real-DB integration test environment, write a failing test that proves `endSessionAction` does not save the transcript (RED), then restore the original plan contract — `endSessionAction(sessionId, messages)` — to make the test green.

The root cause: `context/changes/first-voice-conversation/plan.md:61` designated `endSessionAction` as the **final authoritative transcript save**, but the implementation dropped the `messages` parameter entirely. Per-turn `saveTranscriptAction` calls silently swallow errors, so a session can end with `endedAt` set and no transcript row — no error, no visible failure, FR-007 violated.

## Current State Analysis

- `endSessionAction` (`src/app/actions/sessions.ts:48–56`) performs one DB operation: `UPDATE sessions SET ended_at = now()`. It never calls `saveTranscript`.
- `saveTranscriptAction` (`sessions.ts:26–35`) swallows all errors explicitly: `catch { /* fire-and-forget; failures are silent */ }`.
- `conversation-client.tsx:251` calls `endSessionAction(sessionId)` — no `messages` argument.
- No test runner configured; no `vitest` in `package.json`; `dotenv ^17.4.2` is already installed.
- DB client (`src/db/client.ts:10`) initializes from `process.env.DATABASE_URL` — overriding this in `.env.test` routes the client to a test DB automatically.
- `@/db/index.ts` re-exports `db`, `getTranscriptMessages`, `createSession`, and all other query functions. `transcripts` schema object is in `@/db/schema`.

### Key Discoveries

- `sessions.ended_at` is nullable — the only signal that a session ended (`src/db/schema.ts:27`).
- `transcripts.session_id` has a UNIQUE INDEX. `messages` is JSONB NOT NULL with default `'[]'`. A row with `messages = []` is a distinct failure shape from "no row" — `getTranscriptMessages` returns `[]` for both. Tests asserting transcript content must query the `transcripts` table directly for row existence.
- `ON DELETE CASCADE` on `transcripts.session_id` → `DELETE FROM sessions` in `beforeEach` removes transcript rows automatically.
- `next` package (`16.2.6`) is installed. `src/app/actions/sessions.ts` imports `revalidatePath` from `next/cache` (used only by `deleteSessionAction`, not by `endSessionAction`). Vitest will import the module; if `next/cache` throws on module load in non-Next environments, a `vi.mock('next/cache')` stub may be needed. Check `node_modules/next/dist/docs/` for current guidance before configuring.

## Desired End State

- `npm test` runs Vitest and exits 0.
- One integration test suite at `src/app/actions/__tests__/sessions.integration.test.ts` with two passing tests:
  1. `endSessionAction` saves the transcript and sets `ended_at` for a session with messages.
  2. `endSessionAction` creates a transcript row (even empty) for a zero-turn session.
- `endSessionAction` signature: `(sessionId: string, messages: Message[]) → Promise<{ error: string } | undefined>`.
- `conversation-client.tsx:251` passes the `messages` React state to `endSessionAction`.
- `test-plan.md §6.3` filled with the DB integration test cookbook pattern.

## What We're NOT Doing

- Risks #2, #5 (system-prompt builder unit tests, transcribe route audio-storage tests) — those are test-plan Phase 1; not in scope here.
- Risks #7, #1 (session resume context, AI payload context) — later phases.
- CI/CD wiring for the test suite (test-plan Phase 4).
- Mocking the DB (explicitly prohibited by `test-plan.md §2 Risk #6` anti-pattern).

## Implementation Approach

Four phases following the TDD cycle:

1. **Environment** — install Vitest, wire path alias + `dotenv`, create test DB helpers. `/10x-implement`.
2. **RED** — write the failing integration test against the new API. `/10x-tdd`.
3. **GREEN + edge cases** — fix `endSessionAction`, update call site, add zero-turn test. `/10x-tdd`.
4. **Cookbook sync** — fill `test-plan.md §6.3` and update phase statuses. `/10x-implement`.

## Critical Implementation Details

**`next/cache` import**: `sessions.ts` imports `revalidatePath` from `next/cache` for `deleteSessionAction`. When Vitest loads the module, it will attempt this import. If Next.js 16's `next/cache` cannot be loaded outside a Next.js runtime, add `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` to `src/test/setup.ts`. Verify by checking `node_modules/next/dist/docs/` before Phase 1 implementation.

**DB singleton and `NODE_ENV`**: `src/db/client.ts:11` stores the postgres client on `globalThis._pgClient` when `NODE_ENV !== 'production'`. Vitest runs with `NODE_ENV=test` by default, so the singleton applies. The client is initialized once per Vitest process with the `DATABASE_URL` from `.env.test` — this is the desired behaviour.

---

## Phase 1: Vitest + Test DB Environment

### Overview

Install Vitest, configure it for Node.js + path aliases, set up `.env.test`, and write test DB helpers. The phase ends with `npm test` running and a DB smoke test passing.

### Changes Required

#### 1. Install Vitest

**File**: `package.json`

**Intent**: Add Vitest as a devDependency and expose `npm test` and `npm run test:watch` scripts.

**Contract**: `vitest` and `@vitest/coverage-v8` added to `devDependencies`. Scripts added: `"test": "vitest run"`, `"test:watch": "vitest"`.

---

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, project root)

**Intent**: Configure Vitest to run in Node.js environment, resolve the `@/*` path alias matching `tsconfig.json`, and load test environment variables before the DB client initializes.

**Contract**: `test.environment: 'node'`; `test.setupFiles: ['./src/test/setup.ts']`; `resolve.alias` maps `@` to `path.resolve(__dirname, './src')`.

---

#### 3. Test environment setup file

**File**: `src/test/setup.ts` (new)

**Intent**: Load `.env.test` before any test module runs, so `process.env.DATABASE_URL` is the test DB URL when `src/db/client.ts` initializes its singleton.

**Contract**: Call `dotenv.config({ path: '.env.test' })` at module level. `dotenv` is already installed (`^17.4.2`). If `next/cache` cannot be loaded in the Vitest runtime (see Critical Implementation Details), add a `vi.mock('next/cache', ...)` stub here.

---

#### 4. Test database environment file

**File**: `.env.test` (new)

**Intent**: Provide a `DATABASE_URL` pointing to a dedicated test postgres database that is separate from the dev database.

**Contract**: `DATABASE_URL=<test-db-connection-string>`. The test DB must exist and have migrations applied once before running tests (`drizzle-kit push` or `drizzle-kit migrate` targeting this URL). Add `.env.test` to `.gitignore` if it contains real credentials; commit `.env.test.example` with a placeholder if the team needs a reference.

---

#### 5. Test DB helpers

**File**: `src/test/helpers.ts` (new)

**Intent**: Provide two test utilities: `truncateAll()` for per-test isolation, and `getTranscriptRow(sessionId)` for asserting transcript row existence separately from message content.

**Contract**:
- `truncateAll()`: `await db.delete(sessions)` from `@/db`. The `ON DELETE CASCADE` on `transcripts.session_id` removes transcript rows automatically; no need to delete transcripts separately.
- `getTranscriptRow(sessionId: string)`: direct `db.select().from(transcripts).where(eq(transcripts.sessionId, sessionId))`, returns `rows[0] ?? null`. Import `db` from `@/db`, `transcripts` from `@/db/schema`, `eq` from `drizzle-orm`.

---

#### 6. Smoke test

**File**: `src/test/smoke.test.ts` (new, temporary — removed in Phase 3)

**Intent**: Prove the test runner works, the path alias resolves, and the test DB is reachable before writing the real tests.

**Contract**: One trivial assertion (`expect(1 + 1).toBe(2)`) and one DB connectivity check (`const session = await createSession(); expect(session.id).toBeTruthy()` followed by cleanup). Imports `createSession` from `@/db`.

---

### Success Criteria

#### Automated Verification

- `npm test` exits 0
- `npm run typecheck` exits 0 with `vitest.config.ts` included

#### Manual Verification

- Both smoke test cases pass: trivial assertion and DB connectivity
- Test DB is distinct from the dev DB (different database name in the URL)
- No test output shows connection errors or `next/cache` import failures

**Pause here** for manual confirmation that the test environment is clean before writing the RED test.

---

## Phase 2: Failing Integration Test — RED

### Overview

Write the integration test for `endSessionAction` against its **desired** new signature. Do not touch production code. The test must fail — either a TypeScript compile error (unknown argument) or a runtime assertion failure (transcript not found). That failure is the RED state.

### Changes Required

#### 1. Integration test file

**File**: `src/app/actions/__tests__/sessions.integration.test.ts` (new)

**Intent**: Assert that `endSessionAction(sessionId, messages)` — the restored contract — saves the transcript and sets `ended_at`. Calling the current function with a second argument causes a TypeScript error; that error IS the proof the bug exists.

**Contract**:

```typescript
// beforeEach: await truncateAll()
// testMessages: two Message entries (one user, one assistant), with timestamp strings

it('saves the transcript and sets ended_at', async () => {
  const session = await createSession()
  const result = await endSessionAction(session.id, testMessages)
  // assertions:
  // result is undefined (no error returned)
  // (await getSessionById(session.id))?.endedAt is not null
  // await getTranscriptMessages(session.id) has length === testMessages.length
  //   and [0].content === testMessages[0].content
  //   and [1].content === testMessages[1].content
})
```

Import: `endSessionAction` from `@/app/actions/sessions`; `createSession`, `getSessionById`, `getTranscriptMessages` from `@/db`; `truncateAll` from `@/test/helpers`; `Message` type from `@/db`.

---

#### 2. Confirm RED state

**Intent**: Run `npm test` without modifying production code and record the failure.

**Contract**: `npm test` exits non-zero. The failure is on the `endSessionAction` call (TypeScript error: "Expected 1 arguments, but got 2", or at runtime: transcript messages assertion fails). A DB connection error or beforeEach failure is not an acceptable RED — it means Phase 1 is incomplete.

---

### Success Criteria

#### Automated Verification

- `npm test` exits **non-zero** (test fails as expected)

#### Manual Verification

- The failure message names `endSessionAction` — not a setup or DB connectivity issue
- `npm run typecheck` shows a type error for `sessions.integration.test.ts` (unknown argument to `endSessionAction`)

**Pause here** before modifying any production file.

---

## Phase 3: Fix `endSessionAction` — GREEN + Edge Cases

### Overview

Restore the original plan contract: add `messages: Message[]` to `endSessionAction`, call `saveTranscript` before `endSession`, update the call site in `ConversationClient`. Add the zero-turn edge case test. All tests pass.

### Changes Required

#### 1. Restore `endSessionAction` contract

**File**: `src/app/actions/sessions.ts:48–56`

**Intent**: Accept `messages: Message[]` and call `saveTranscript(sessionId, messages)` before `endSession(sessionId)`. Always save — even when `messages` is empty — to guarantee a transcript row exists for every ended session.

**Contract**: New signature: `endSessionAction(sessionId: string, messages: Message[]): Promise<{ error: string } | undefined>`. Body: single try/catch wrapping `await saveTranscript(sessionId, messages)` followed by `await endSession(sessionId)`. If either throws, return `{ error: 'Failed to end session. Please try again.' }`. No other changes to the error path.

---

#### 2. Update call site

**File**: `src/app/session/[id]/_components/conversation-client.tsx:251`

**Intent**: Pass the current `messages` React state to `endSessionAction` so the final transcript saved at session end is the authoritative, client-held state.

**Contract**: `handleEndSession()` (line 248–258) calls `await endSessionAction(sessionId, messages)` where `messages` is `const [messages, setMessages] = useState<Message[]>(...)` at line 41. No other changes to `handleEndSession`.

---

#### 3. Edge case: zero-turn session

**File**: `src/app/actions/__tests__/sessions.integration.test.ts`

**Intent**: Prove that `endSessionAction(sessionId, [])` creates a transcript row (not a missing row), so the "saved empty" state is distinguishable from "no save happened".

**Contract**:

```typescript
it('creates a transcript row for a zero-turn session', async () => {
  const session = await createSession()
  const result = await endSessionAction(session.id, [])
  // result is undefined
  // (await getSessionById(session.id))?.endedAt is not null
  // await getTranscriptRow(session.id) is not null  ← row exists
  // await getTranscriptMessages(session.id) deep-equals []
})
```

Import `getTranscriptRow` from `@/test/helpers`.

---

#### 4. Remove smoke test

**File**: `src/test/smoke.test.ts`

**Intent**: The smoke test served its purpose in Phase 1; remove it so the test suite contains only meaningful assertions.

**Contract**: Delete the file.

---

### Success Criteria

#### Automated Verification

- `npm test` exits 0 (both integration tests pass)
- `npm run typecheck` exits 0
- `npm run lint` exits 0

#### Manual Verification

- The RED test from Phase 2 is now GREEN — transcript messages match the passed `testMessages` array
- Zero-turn test passes — row exists in `transcripts` with `messages = []`
- Start the dev server (`npm run dev`); open a session; say one message; click "End session"; check `/sessions` — message count shows 1. This confirms the end-to-end fix is live, not just tested.

**Pause here** for manual confirmation before proceeding to the cookbook.

---

## Phase 4: Cookbook + Test-Plan Sync

### Overview

Fill the `test-plan.md §6.3` placeholder with the concrete pattern established in Phases 1–3. Update the §3 rollout phase status rows.

### Changes Required

#### 1. Fill `test-plan.md §6.3` cookbook pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 2` placeholder with a concrete, reusable recipe for DB-dependent server action integration tests in this project.

**Contract**: Write a `### 6.3 Adding an integration test (DB-dependent server action)` section covering:
- Test file naming convention: `src/app/actions/__tests__/<name>.integration.test.ts`
- Required imports: action under test from `@/app/actions/`; query functions from `@/db`; `db` from `@/db` and schema from `@/db/schema` for direct table queries; `truncateAll` and `getTranscriptRow` from `@/test/helpers`
- `beforeEach` pattern: call `truncateAll()` — do not mock the DB
- Assertion shape: call the action, then query the DB directly and assert both the primary record and the child record with specific content (not just "mock was called")
- Avoid-mocking rule: asserting that a mock DB method was called does not verify the SQL is correct and does not catch constraint violations

---

#### 2. Update §3 rollout phase status

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect what is and isn't done after this change lands.

**Contract**:
- Phase 1 row: `Status: in progress` (Vitest bootstrapped by this change; system-prompt builder and transcribe route tests remain for a separate Phase 1 change). Change folder: `test-risk6-session-end`.
- Phase 2 row: `Status: in progress` (Risk #6 covered; Risks #7 and #1 remain). Change folder: `test-risk6-session-end`.

---

### Success Criteria

#### Automated Verification

- `npm test` exits 0 (no test files changed)
- `npm run lint` exits 0

#### Manual Verification

- `test-plan.md §6.3` is usable as a standalone recipe — a developer writing the next DB integration test (Risk #7) can follow it without reading this plan
- Phase status rows in §3 are accurate: Vitest bootstrapped, Risk #6 covered, Risks #7/#1 remain

---

## Testing Strategy

### Integration Tests

Covered in Phase 2–3. Both tests use a real test DB with per-test truncation.

| Test | What it catches |
|---|---|
| `endSessionAction saves transcript and sets ended_at` | `saveTranscript` not called on session end — the original bug |
| `endSessionAction creates transcript row for zero-turn session` | Session ends with no prior messages; row must still exist |

### Manual Testing

- Phase 1: smoke test (DB connectivity)
- Phase 3: full voice session end-to-end verification on dev server

## References

- Research: `context/changes/test-risk6-session-end/research.md`
- Original plan contract broken: `context/changes/first-voice-conversation/plan.md:61,92–96`
- `endSessionAction`: `src/app/actions/sessions.ts:48–56`
- `saveTranscriptAction`: `src/app/actions/sessions.ts:26–35`
- `conversation-client.tsx` call site: line 251
- DB client singleton: `src/db/client.ts:10–13`
- Schema: `src/db/schema.ts:23–43`
- Test plan risk response: `context/foundation/test-plan.md §2 Risk #6`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest + Test DB Environment

#### Automated

- [x] 1.1 `npm test` exits 0
- [x] 1.2 `npm run typecheck` exits 0 with `vitest.config.ts` included

#### Manual

- [x] 1.3 Both smoke test cases pass (trivial assertion and DB connectivity)
- [x] 1.4 Test DB is distinct from the dev DB (different database name in URL)
- [x] 1.5 No `next/cache` import failures in test output

### Phase 2: Failing Integration Test — RED

#### Automated

- [x] 2.1 `npm test` exits non-zero (test fails as expected)

#### Manual

- [x] 2.2 Failure names `endSessionAction` — not a setup issue
- [x] 2.3 `npm run typecheck` shows type error in `sessions.integration.test.ts`

### Phase 3: Fix endSessionAction — GREEN + Edge Cases

#### Automated

- [x] 3.1 `npm test` exits 0 (both integration tests pass)
- [x] 3.2 `npm run typecheck` exits 0
- [x] 3.3 `npm run lint` exits 0

#### Manual

- [x] 3.4 RED test from Phase 2 is now GREEN
- [x] 3.5 Zero-turn test passes
- [ ] 3.6 Dev session end-to-end verified: message count correct in `/sessions` after ending

### Phase 4: Cookbook + Test-Plan Sync

#### Automated

- [x] 4.1 `npm test` exits 0 (no test regressions)
- [x] 4.2 `npm run lint` exits 0

#### Manual

- [x] 4.3 `test-plan.md §6.3` usable as standalone recipe for next DB integration test
- [x] 4.4 §3 phase status rows accurate
