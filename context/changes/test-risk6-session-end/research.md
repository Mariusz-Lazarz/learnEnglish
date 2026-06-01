---
date: 2026-06-01T19:30:29+00:00
researcher: Claude Sonnet 4.6
git_commit: 5da3fbe9e0b19b601651adc7d8fe2ddcc2f6c3a8
branch: main
repository: 10xdevs3
topic: "Transcript silently not saved on session end — Risk #6"
tags: [research, sessions, transcripts, end-session, data-integrity, risk6]
status: complete
last_updated: 2026-06-01
last_updated_by: Claude Sonnet 4.6
---

# Research: Transcript Silently Not Saved on Session End (Risk #6)

**Date**: 2026-06-01T19:30:29+00:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 5da3fbe9e0b19b601651adc7d8fe2ddcc2f6c3a8
**Branch**: main
**Repository**: 10xdevs3

## Research Question

From `context/foundation/test-plan.md` §2 Risk #6:

> Transcript silently not saved on session end — end-session action swallows an error; session record or transcript is missing with no visible failure.

What DB operations does the end-session action perform and in what order? Are failures surfaced or silently discarded?

---

## Summary

**The critical finding: `endSessionAction` does NOT save the transcript.**

The plan that introduced session end (`context/changes/first-voice-conversation/plan.md`) specified `endSessionAction(sessionId, messages)` as the **final authoritative save** — it was supposed to call `saveTranscript` before `endSession`, precisely to catch any missed per-turn saves. The implementation dropped the `messages` parameter and removed the `saveTranscript` call entirely.

The result: a session can end with `endedAt` set (the success path the UI follows) while the `transcripts` row either does not exist or contains fewer messages than the conversation actually had. There is no error, no warning, and no visible failure.

The silent-failure path lives in `saveTranscriptAction` (`src/app/actions/sessions.ts:26–35`), which swallows all errors explicitly (`// fire-and-forget; failures are silent`). Because `endSessionAction` never calls `saveTranscript`, those silently-dropped per-turn errors are never caught.

---

## Detailed Findings

### 1. The Oracle — What FR-007 Requires

**`context/foundation/prd.md`**, FR-007:

> Session conversation transcript (text) is saved automatically when the session ends — no audio stored.

The requirement is unambiguous: transcript persistence is a condition of session end, not a best-effort side effect. A session that ends without a non-empty transcript (for any session that had conversation turns) violates FR-007.

---

### 2. What `endSessionAction` Actually Does

**`src/app/actions/sessions.ts:48–56`**:

```typescript
export async function endSessionAction(
  sessionId: string
): Promise<{ error: string } | undefined> {
  try {
    await endSession(sessionId)   // only operation
  } catch {
    return { error: 'Failed to end session. Please try again.' }
  }
}
```

**`src/db/queries/sessions.ts:77–79`**:

```typescript
export async function endSession(id: string): Promise<void> {
  await db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, id));
}
```

**`endSessionAction` performs exactly one DB operation**: `UPDATE sessions SET ended_at = now() WHERE id = ?`.

It does **not** call `saveTranscript`. It does **not** check whether a transcript row exists. Its only concern is setting `endedAt`.

Error handling is present: a thrown exception returns `{ error: '...' }` to the caller, which then displays it in the UI. But the only way `endSession` throws is a DB connection failure or a session not found — neither has anything to do with transcript persistence.

---

### 3. The Plan Contract That Was Broken

**`context/changes/first-voice-conversation/plan.md:61`** (emphasis mine):

> **`saveTranscriptAction` fire-and-forget** — Call with `void saveTranscriptAction(...)` (no await). Failures are silent — **the final `endSessionAction` call is the authoritative save that catches any missed per-turn saves.**

**`context/changes/first-voice-conversation/plan.md:92–96`** (original contract):

```typescript
export async function endSessionAction(
  sessionId: string,
  messages: Message[]           // ← dropped in implementation
): Promise<{ error: string } | undefined>
// On success: calls saveTranscript(sessionId, messages) then endSession(sessionId); returns undefined.
```

**`context/changes/first-voice-conversation/plan.md:268`** (original call site):

```typescript
const result = await endSessionAction(sessionId, messages)  // messages passed
```

**Actual call site** (`src/app/session/[id]/_components/conversation-client.tsx:251`):

```typescript
const result = await endSessionAction(sessionId)  // no messages
```

The `messages` parameter was removed from both the action signature and the call site. The `saveTranscript` call that was supposed to happen inside `endSessionAction` was never implemented. This is the root cause of Risk #6.

---

### 4. The Silent Failure Path — Step by Step

The design intent was: per-turn saves are best-effort; the end action is the guarantee. The implementation removed the guarantee but kept the per-turn saves as the only mechanism. Here is the failure sequence:

1. User has a conversation. After each assistant turn, `void saveTranscriptAction(sessionId, updated)` is called fire-and-forget (`conversation-client.tsx:239`).
2. One or more of those per-turn saves fails (DB timeout, transient connection error, etc.).
3. `saveTranscriptAction` catches the error silently (`sessions.ts:32–34`: `// fire-and-forget; failures are silent`). The UI does not know.
4. User clicks "End session" → `handleEndSession()` calls `endSessionAction(sessionId)`.
5. `endSessionAction` calls only `endSession(sessionId)` — sets `endedAt = now()`. Succeeds.
6. `handleEndSession` receives `undefined` (no error) → `router.push('/')`.
7. Session appears in the past-sessions list with `endedAt` set. Transcript row either does not exist or has fewer messages than the conversation actually produced. No error was shown.

**Worst case**: the very first per-turn save fails. The `transcripts` table has no row for this session. The session "ended successfully" but FR-007 is violated.

**Edge case**: the first per-turn save creates the row (INSERT succeeds). A subsequent save fails. The row exists but `messages` is missing later turns. The user would see the session in history but cannot resume from the true end of the conversation.

---

### 5. DB Schema — What Tests Need to Assert Against

**`src/db/schema.ts:23–43`**:

#### `sessions` table

| Column | Type | NOT NULL | Default |
|---|---|---|---|
| `id` | uuid | YES | randomUUID() |
| `lesson_id` | uuid | NO | null |
| `started_at` | timestamptz | YES | now() |
| `ended_at` | timestamptz | NO | null |
| `rolling_summary` | text | NO | null |

`ended_at` is nullable. A non-null `ended_at` is the only signal that a session ended.

#### `transcripts` table

| Column | Type | NOT NULL | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | YES | randomUUID() | PK |
| `session_id` | uuid | YES | — | FK → sessions.id ON DELETE CASCADE; UNIQUE INDEX |
| `messages` | jsonb | YES | `'[]'` | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

Critical constraints for tests:
- `session_id` has a **UNIQUE INDEX** — one transcript row per session, enforced by DB.
- `messages` defaults to `'[]'` (empty array) on INSERT if not provided. A row can legally exist with `messages = []`.
- `ON DELETE CASCADE` — deleting the session deletes the transcript row.

A test that only asserts "the transcript row exists" can pass even if `messages = []`. Tests **must** assert that `messages` is non-empty.

---

### 6. `saveTranscript` — The Only Write Path for Transcripts

**`src/db/queries/sessions.ts:93–104`**:

```typescript
export async function saveTranscript(sessionId: string, messages: Message[]): Promise<void> {
  await db
    .insert(transcripts)
    .values({ sessionId, messages })
    .onConflictDoUpdate({
      target: transcripts.sessionId,
      set: { messages, updatedAt: sql`now()` },
    });
}
```

Behaviour:
- First call for a session: INSERT (creates the transcript row).
- Subsequent calls: UPDATE `messages` + `updated_at` (idempotent upsert via UNIQUE INDEX).
- Called only from `saveTranscriptAction`, which swallows all errors.
- **Never called from `endSessionAction`.**

---

### 7. Call Chain Summary

```
conversation-client.tsx:239
  └─ void saveTranscriptAction(sessionId, updated)   ← fire-and-forget, per-turn
       └─ saveTranscript(sessionId, messages)        ← only write path for transcripts
            └─ INSERT ... ON CONFLICT DO UPDATE      ← upsert on transcripts.session_id
       catch { /* silent */ }

conversation-client.tsx:251
  └─ await endSessionAction(sessionId)               ← no messages arg
       └─ endSession(sessionId)                      ← UPDATE sessions SET ended_at = now()
       catch → return { error: '...' }               ← surfaced to UI (for endSession failures only)
```

There is no path from `endSessionAction` to `saveTranscript`.

---

### 8. What Tests Must Prove (Oracle)

Per FR-007 and the risk-response guidance in `test-plan.md` §2 Risk #6:

> End-session action creates a session record with a non-empty transcript in the DB.

**Minimum integration test contract**:

1. Create a session in the test DB.
2. Simulate a conversation — insert messages via `saveTranscript` (simulating what per-turn saves would produce) OR call `saveTranscriptAction` directly.
3. Call `endSessionAction(sessionId)`.
4. Query the DB directly:
   - `sessions` row has `ended_at IS NOT NULL`.
   - `transcripts` row exists for `session_id`.
   - `messages` array is **non-empty** (not just the row existing — `messages = '[]'` is the silent failure shape).

**The trap to avoid** (per `test-plan.md` §2 Risk #6 anti-pattern):

> Mocking the DB and asserting the mock was called (does not verify the SQL is correct).

Tests must use a real test DB.

**Second scenario to test** (the gap the plan intended to close):

1. Create a session.
2. Do NOT call `saveTranscriptAction` at all (no per-turn saves).
3. Call `endSessionAction(sessionId)`.
4. Query the DB: the `transcripts` row should exist and `messages` should be non-empty (or the session should be rejected as invalid).

This scenario currently **fails** — no transcript row will exist. The test would surface the plan/implementation divergence. The `/10x-plan` step must decide whether to fix `endSessionAction` to do a final authoritative save (restoring the original contract) or accept the per-turn-only model and strengthen `saveTranscriptAction` to surface failures.

---

## Code References

- `src/app/actions/sessions.ts:26–35` — `saveTranscriptAction`: fire-and-forget, silent catch
- `src/app/actions/sessions.ts:48–56` — `endSessionAction`: only sets `endedAt`, no transcript save
- `src/db/queries/sessions.ts:77–79` — `endSession`: single UPDATE, no transcript involvement
- `src/db/queries/sessions.ts:93–104` — `saveTranscript`: upsert, the only write path to transcripts
- `src/db/schema.ts:23–29` — `sessions` table schema
- `src/db/schema.ts:31–43` — `transcripts` table schema (UNIQUE on session_id, messages NOT NULL default `[]`)
- `src/app/session/[id]/_components/conversation-client.tsx:239` — fire-and-forget per-turn save call
- `src/app/session/[id]/_components/conversation-client.tsx:248–258` — `handleEndSession()`, calls `endSessionAction(sessionId)` without `messages`

## Architecture Insights

**Non-atomic save sequence**: Session end consists of two independent DB operations — `saveTranscript` (per-turn, not on end) and `endSession` (on end). There is no transaction binding them. Drizzle ORM supports transactions but none is used here.

**Silent write vs. surfaced write asymmetry**: Write operations are split into two tiers:
- Transcript writes (`saveTranscriptAction`) — fire-and-forget, silent failures.
- Session state writes (`endSessionAction`, `deleteSessionAction`, `startSessionAction`) — surfaced failures, returned to caller.

This asymmetry means the user always sees session lifecycle errors but never transcript persistence errors.

**UNIQUE INDEX as upsert key**: The `transcripts_session_id_idx` unique index is the mechanism enabling idempotent per-turn saves. Its side effect: a session can appear to have a transcript while `messages = []` if only the first (empty) save succeeded.

## Historical Context

- `context/changes/first-voice-conversation/plan.md:61` — design intent: `endSessionAction` is the authoritative save; per-turn saves are best-effort. Implementation dropped this guarantee.
- `context/changes/first-voice-conversation/plan.md:92–96` — original `endSessionAction` signature with `messages: Message[]` parameter and `saveTranscript` call.
- `context/changes/db-schema-data-access/` — F-01 that introduced the `transcripts` table with its upsert semantics. No test infrastructure introduced.

## Open Questions

1. **Restore or re-design?** The original plan contract is clear: `endSessionAction` should do a final authoritative save. The implementation dropped it. The `/10x-plan` step must decide: restore `endSessionAction(sessionId, messages)` to call `saveTranscript` before `endSession`, or adopt a different guarantee (e.g. surfacing errors from `saveTranscriptAction` instead of silencing them).

2. **What if the transcript has zero messages?** A transcript row with `messages = []` is a real failure shape (silent first-save failure, subsequent saves update an empty array). Tests must distinguish "row exists with content" from "row exists with empty messages".

3. **Test DB isolation strategy**: The test plan (§4) defers the DB isolation decision to Phase 2 research. The `saveTranscript` upsert uses a UNIQUE INDEX as the conflict target — any test DB strategy must respect that index (not truncate only `sessions` while leaving orphan transcript rows, etc.).
