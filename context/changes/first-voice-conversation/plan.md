# First Voice Conversation — North Star Slice Implementation Plan

## Overview

Build S-02: the end-to-end voice session experience. A user picks a lesson, the app creates a session and navigates to a dedicated conversation page, the AI teacher greets them automatically, they speak via push-to-talk, the AI responds via TTS, and when they end the session the transcript is saved and they return home.

All three prerequisites are fully complete: F-01 (DB schema + DAL), F-02 (voice pipeline, VPS-verified <3s), S-01 (lesson CRUD with disabled "Start conversation" placeholder). This slice wires them together into the product's first user-visible value.

## Current State Analysis

- **DB**: `sessions`, `transcripts` tables live. `createSession`, `endSession`, `saveTranscript`, `getSessionById`, `getLessonById` all exported from `@/db`.
- **Voice pipeline**: `/api/transcribe` (Whisper), `/api/chat` (GPT-4o mini, accepts optional `systemPrompt`), `/api/tts` (OpenAI TTS) all live and VPS-verified. Chat route uses `toTextStreamResponse()` — returns plain text stream; no changes needed.
- **Lesson CRUD**: Home page at `/` shows lessons. Each `LessonCard` has a `disabled` "Start conversation" button at `src/app/_components/lesson-card.tsx:38` — the exact placeholder this slice activates.
- **Message type**: `{ role: 'user' | 'assistant'; content: string; timestamp: string }` in `src/db/schema.ts`. Strip `timestamp` before sending to `/api/chat`.
- **No session routes**: `src/app/session/` does not exist.
- **No session actions**: `src/app/actions/sessions.ts` does not exist.
- **Pipeline-test pattern**: `src/app/pipeline-test/page.tsx` demonstrates the exact voice loop (Record → MediaRecorder → Whisper → stream LLM → TTS → Audio) that phases 3–4 replicate.

## Desired End State

- Clicking "Start conversation" on a lesson card creates a DB session and navigates to `/session/[id]`.
- The session page auto-plays the AI's opening greeting (in English, referencing the lesson topic, with an opening question — US-01 AC).
- User can speak via push-to-talk; each turn produces a transcript entry and an audible AI response.
- Transcript is persisted to DB after every assistant message (upsert, fire-and-forget).
- "End session" AlertDialog → `endSession` + final `saveTranscript` → redirect to `/`.
- All failures during a turn surface as an inline error with a "Try again" button; session stays open.

### Key Discoveries

- `src/app/api/chat/route.ts:7` — `const { messages, systemPrompt } = await req.json()` already accepts lesson-aware system prompt; no route changes needed.
- `src/db/queries/sessions.ts:43` — `createSession(lessonId?: string)` accepts optional lessonId, returns `Session` with generated `id`.
- `src/db/queries/sessions.ts:59` — `saveTranscript` is a `INSERT ... ON CONFLICT DO UPDATE` upsert keyed on `session_id` — idempotent; safe to call per-turn.
- `src/app/_components/lesson-card.tsx` — already `'use client'`; add `useTransition` + `useRouter` to enable the button without restructuring the component.
- `src/db/queries/lessons.ts` — `getLessonById(id: string)` returns full `Lesson` (subject, conversationGoal, vocabulary) needed for system prompt construction.
- `SessionWithLesson` (from `getSessionById`) includes `lessonId` and `lessonName` but NOT subject/goal/vocabulary — a second `getLessonById` call is required in the session page.
- Next.js App Router params in this version are a `Promise<{ id: string }>` that must be awaited (consistent with async Server Component pattern).

## What We're NOT Doing

- No voice activity detection (VAD) — push-to-talk only, same as pipeline-test.
- No beforeunload / visibilitychange transcript save — per-turn persistence makes this unnecessary.
- No session resume (loading prior transcript context) — that is S-03.
- No "Start conversation" from free conversation path — that is S-04; S-02 only activates lesson-card sessions.
- No session list UI — that is S-03.
- No end-of-session mistake summary — PRD §Non-Goals, v2.
- No changes to `/api/chat`, `/api/transcribe`, or `/api/tts` routes.
- No changes to the DB schema or DAL.

## Implementation Approach

Four sequential phases. Phases 1–2 are non-UI plumbing (actions and the prompt builder). Phase 3 is the Server Component shell. Phase 4 is the Client Component — the core interactive experience. Each phase is independently verifiable before the next begins. All new UI uses shadcn/ui components matching the existing lessons page.

## Critical Implementation Details

**Messages state vs LLM messages** — The `messages: Message[]` state includes `timestamp` (DB contract). The `/api/chat` route expects Vercel AI SDK message format `{ role, content }` — no timestamp. Strip before every chat call: `messages.map(({ role, content }) => ({ role, content }))`.

**AI greeting seed message** — On mount, POST to `/api/chat` with `messages: [{ role: 'user', content: 'Start' }]`. This synthetic trigger message is NEVER added to the `messages` state. Only the AI's greeting response is stored as the first message. Subsequent turns send the real conversation history (starting with the AI greeting) without this seed.

**Turn atomicity** — Add user turn + AI response to `messages` state together AFTER the full turn succeeds (STT → LLM → TTS complete). If any step fails mid-turn, messages state is unchanged and the user can retry cleanly.

**`saveTranscriptAction` fire-and-forget** — Call with `void saveTranscriptAction(...)` (no await). Failures are silent — the final `endSessionAction` call is the authoritative save that catches any missed per-turn saves.

---

## Phase 1: Session server actions + lesson card activation

### Overview

Create all three session mutation server actions in a new `src/app/actions/sessions.ts`. Enable the "Start conversation" button on lesson cards to call `startSessionAction` and navigate to the session page.

### Changes Required

#### 1. Session server actions

**File**: `src/app/actions/sessions.ts`

**Intent**: Three server actions covering the session lifecycle needed by S-02: start (create DB row + return session ID), save transcript (per-turn upsert), and end (final save + mark ended). Follow the same `'use server'` + try/catch + error shape pattern established in `src/app/actions/lessons.ts`.

**Contract**:
```typescript
'use server'

export async function startSessionAction(
  lessonId: string
): Promise<{ sessionId: string } | { error: string }>

export async function saveTranscriptAction(
  sessionId: string,
  messages: Message[]
): Promise<void>  // fire-and-forget; caller does not await; failures are silent

export async function endSessionAction(
  sessionId: string,
  messages: Message[]
): Promise<{ error: string } | undefined>
// On success: calls saveTranscript(sessionId, messages) then endSession(sessionId); returns undefined.
// Does NOT call redirect() — client is responsible for router.push('/').
```

`Message` imported as `import type { Message } from '@/db'`. DAL calls: `createSession(lessonId)`, `saveTranscript(sessionId, messages)`, `endSession(sessionId)`.

#### 2. Enable lesson card Start conversation button

**File**: `src/app/_components/lesson-card.tsx`

**Intent**: Replace the `disabled` placeholder with a functional push that creates a session and navigates to `/session/[id]`. The component is already `'use client'` and follows the `useTransition` pattern.

**Contract**:
- Add `useTransition` (React 19) and `useRouter` (from `next/navigation`).
- Add local state `startError: string | null`.
- `onClick` on the "Start conversation" button: `startTransition(async () => { const result = await startSessionAction(lesson.id); if ('sessionId' in result) { router.push('/session/' + result.sessionId) } else { setStartError(result.error) } })`
- Button: `disabled={isPending}`, shows a spinner from `lucide-react` while `isPending`.
- Remove the `disabled` attribute that was the S-01 placeholder.
- If `startError` is non-null, render it as a small error string below the card footer (same `text-destructive text-sm` pattern as other components).

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run lint` exits 0

#### Manual Verification

- Clicking "Start conversation" on a lesson card with at least one lesson present:
  - Button shows spinner briefly while session is created
  - Browser navigates to `/session/<uuid>` (404 is acceptable at this phase — session page doesn't exist yet)
  - New row appears in the `sessions` table: `SELECT id, lesson_id, started_at, ended_at FROM sessions ORDER BY started_at DESC LIMIT 1;`
- Clicking the button a second time creates a second session row (no uniqueness constraint on concurrent sessions)

**Implementation Note**: After all automated checks pass and manual verification confirms DB session creation and navigation, pause for human confirmation before proceeding to Phase 2.

---

## Phase 2: Lesson-aware system prompt builder

### Overview

Create a pure function that transforms a `Lesson` record into the AI system prompt that drives the session. This is the behavioral contract between the lesson schema (finalized in S-01) and the AI pipeline (finalized in F-02).

### Changes Required

#### 1. System prompt builder

**File**: `src/lib/system-prompt.ts`

**Intent**: Produce a system prompt string that locks the AI into the lesson's topic, instructs it to lead the conversation, applies the error-correction rules from the PRD (FR-011, FR-012, FR-013, FR-014), and directs it to open with a greeting + topic reference + opening question (US-01 AC).

**Contract**: Export two items:
- `buildSystemPrompt(lesson: Lesson): string` — builds the lesson-specific prompt incorporating all four fields (`name`, `subject`, `conversationGoal`, `vocabulary`). The vocabulary section is included only when `lesson.vocabulary` is non-null/non-empty. The prompt instructs: English only, greet + confirm topic + ask opening question at start, lead the conversation, stay on topic, correct only major errors, keep responses to 1–2 sentences.
- `FREE_CONVERSATION_SYSTEM_PROMPT: string` — constant for S-04 free conversation sessions (topic constraint removed). Referenced here so S-04 can import it without re-implementing the base rules.

`Lesson` imported as `import type { Lesson } from '@/db'`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run lint` exits 0

#### Manual Verification

- Call `buildSystemPrompt` in a quick REPL check (`npx tsx -e "import { buildSystemPrompt } from './src/lib/system-prompt'; console.log(buildSystemPrompt({ id: '1', name: 'Travel', subject: 'Airports', conversationGoal: 'Ask for directions', vocabulary: 'terminal, gate, boarding pass', createdAt: new Date(), updatedAt: new Date() }))"`)
- Output contains: lesson name, subject, conversationGoal, vocabulary, and the instruction to greet + confirm topic + ask opening question
- Call again with `vocabulary: null` — output does NOT contain a vocabulary line (no blank/null line in the prompt)

**Implementation Note**: Pause for human confirmation after manual verification passes.

---

## Phase 3: Session page (Server Component)

### Overview

Create the route at `src/app/session/[id]/` — a Server Component that fetches the session and its lesson, builds the system prompt, and renders the `ConversationClient` shell. Handles edge cases: missing session (404) and already-ended session (redirect home).

### Changes Required

#### 1. Session page

**File**: `src/app/session/[id]/page.tsx`

**Intent**: Fetch all data server-side (session record + full lesson record) before the client mounts, so `ConversationClient` receives ready-to-use props with no client-side fetching. Guard against accessing a non-existent or already-ended session.

**Contract**:
- No `'use client'` — Server Component.
- `params` type: `{ params: Promise<{ id: string }> }` — await before use.
- Fetch order: `getSessionById(id)` → if undefined, call `notFound()`; if `session.endedAt !== null`, call `redirect('/')`.
- Then: `const lesson = session.lessonId ? await getLessonById(session.lessonId) : null`.
- `const systemPrompt = lesson ? buildSystemPrompt(lesson) : FREE_CONVERSATION_SYSTEM_PROMPT`.
- Render: a `<main>` wrapper with `ConversationClient` receiving props `{ sessionId: session.id, lessonName: lesson?.name ?? 'Free conversation', systemPrompt }`.
- Imports: `notFound`, `redirect` from `'next/navigation'`; `getSessionById`, `getLessonById` from `'@/db'`; `buildSystemPrompt`, `FREE_CONVERSATION_SYSTEM_PROMPT` from `'@/lib/system-prompt'`; `ConversationClient` from `'./_components/conversation-client'`.

#### 2. Conversation client placeholder (for typecheck only)

**File**: `src/app/session/[id]/_components/conversation-client.tsx`

**Intent**: Minimal stub so Phase 3 typechecks and builds without Phase 4 being complete. Replaced in full by Phase 4.

**Contract**: `'use client'` directive. Exports `ConversationClient` as a named export accepting `{ sessionId: string; lessonName: string; systemPrompt: string }` props. Renders a `<div>` with the lesson name and a `<p>Loading…</p>` placeholder. No logic.

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run build` exits 0

#### Manual Verification

- Navigate to `/session/<valid-uuid-from-phase-1>` — page renders without console errors; shows the stub "Loading…" placeholder
- Navigate to `/session/00000000-0000-0000-0000-000000000000` — Next.js returns a 404 page (confirm in browser)
- End a session manually (`UPDATE sessions SET ended_at = NOW() WHERE id = '<id>'`) then navigate to its URL — browser redirects to `/`

**Implementation Note**: Pause for human confirmation after manual verification passes.

---

## Phase 4: Conversation client (voice loop + AI greeting + persistence + end flow)

### Overview

Replace the Phase 3 stub with the full `ConversationClient`. This component owns the entire interactive session: AI auto-greeting on mount, push-to-talk voice loop, per-turn transcript persistence, inline error + retry, and session end confirmation. The implementation mirrors the verified `pipeline-test` pattern extended with lesson context, DB persistence, and product UI.

### Changes Required

#### 1. Conversation client (full implementation)

**File**: `src/app/session/[id]/_components/conversation-client.tsx`

**Intent**: Replace the Phase 3 stub with the complete Client Component. Orchestrates the full voice session lifecycle: auto-greeting → voice loop turns → transcript saves → session end.

**Contract**:
- `'use client'` directive at top.
- Props: `{ sessionId: string; lessonName: string; systemPrompt: string }`.
- State:
  - `messages: Message[]` — completed turns only; updated atomically after each full turn succeeds.
  - `turnState: 'idle' | 'recording' | 'processing' | 'error'`
  - `streamingText: string` — live LLM output during streaming (cleared after turn completes)
  - `errorMessage: string | null`
  - `endDialogOpen: boolean`
  - `isEnding: boolean` — spinner on AlertDialog confirm button
- **Mount effect (runs once)**: calls `runAIGreeting()`:
  1. Set `turnState: 'processing'`
  2. POST `/api/chat` with `{ messages: [{ role: 'user', content: 'Start' }], systemPrompt }` — the seed message is NOT stored in state; it is not sent on any subsequent turn
  3. Stream response body → accumulate `fullText` (same reader loop as `pipeline-test/page.tsx:71–82`)
  4. POST `/api/tts` with `{ text: fullText }` → play audio via `new Audio(URL.createObjectURL(blob)).play()`
  5. On success: add `{ role: 'assistant', content: fullText, timestamp: new Date().toISOString() }` to `messages`; fire `void saveTranscriptAction(sessionId, updatedMessages)`
  6. Set `turnState: 'idle'`
  7. On any failure: set `turnState: 'error'`, `errorMessage` to the error string
- **`startRecording()`**: `navigator.mediaDevices.getUserMedia({ audio: true })` → `new MediaRecorder(stream, { mimeType: 'audio/webm' })` → start → set `turnState: 'recording'`. Identical to `pipeline-test` pattern.
- **`stopRecording()`**: Collects audio blob as in `pipeline-test`; set `turnState: 'processing'`; runs the turn pipeline:
  1. POST FormData to `/api/transcribe` → `{ transcript }`
  2. Build `nextMessages = [...messages, { role: 'user', content: transcript, timestamp: ... }]`
  3. POST `/api/chat` with `{ messages: nextMessages.map(({ role, content }) => ({ role, content })), systemPrompt }` — timestamps stripped before sending
  4. Stream → `fullText`
  5. POST `/api/tts` → play audio
  6. On success: add both the user message and the AI message to `messages` state atomically; fire `void saveTranscriptAction(sessionId, updatedMessages)`; set `turnState: 'idle'`
  7. On any failure: `messages` state unchanged; set `turnState: 'error'`, `errorMessage`
- **"Try again" button** (visible when `turnState === 'error'`): sets `turnState: 'idle'`, clears `errorMessage`. User can record a new turn.
- **"End session" button**: sets `endDialogOpen: true`
- **AlertDialog for end confirmation**:
  - Description: "End session? Your conversation transcript will be saved."
  - Cancel: `endDialogOpen: false`
  - Confirm button (`disabled={isEnding}`, spinner while `isEnding`):
    1. Set `isEnding: true`
    2. `const result = await endSessionAction(sessionId, messages)`
    3. If `result?.error`: show error inside dialog, set `isEnding: false`
    4. If undefined (success): `router.push('/')`
- **Layout** (shadcn/ui):
  - Header: `<h1>` with `lessonName`; back arrow link to `/` on the left (allows leaving without ending, per "no special handling" decision — session remains open with per-turn saves)
  - Scrollable message list: `messages.map(m => ...)` — user messages right-aligned (`justify-end`), AI messages left-aligned; `streamingText` shown as the current in-progress AI message with a blinking cursor indicator; auto-scroll to bottom on new message
  - Processing/error state area below the list: spinner when `turnState === 'processing'`; error text + "Try again" button when `turnState === 'error'`
  - Bottom controls: Record/Stop button (shadcn `Button`, red when recording, disabled when `turnState !== 'idle' && turnState !== 'recording'`); "End session" button (shadcn `Button` variant `outline`, disabled when `turnState === 'processing'`)
- `router` from `useRouter` (next/navigation); `useTransition` not needed (async state managed manually via `turnState`).

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification

- Navigate to `/session/<id>` (with a valid active session linked to a lesson):
  - AI greeting streams and plays automatically; no Record button press needed
  - AI greeting text is in English, references the lesson topic, ends with a question (US-01 AC)
  - Greeting message appears in the conversation list after audio plays
- Click Record, speak a sentence in English, click Stop:
  - Transcript appears during processing
  - AI response streams in and plays via audio
  - Both user message and AI response appear in the conversation list
  - `SELECT messages FROM transcripts WHERE session_id = '<id>'` — row exists with both messages
- Trigger an error (disconnect network mid-turn) — error message + "Try again" button appear; session stays open; clicking "Try again" allows a new recording
- Click "End session":
  - AlertDialog appears with correct copy
  - Cancel closes the dialog without navigation
  - Confirm: spinner shows briefly; browser navigates to `/`
  - `SELECT ended_at FROM sessions WHERE id = '<id>'` — `ended_at` is now set
  - `SELECT messages FROM transcripts WHERE session_id = '<id>'` — all messages present including last turn
- Test on mobile browser: record, receive response, end session — layout is usable, buttons are tappable

**Implementation Note**: Pause for human confirmation after all manual verification passes — this is the north star slice; all US-01 acceptance criteria must be met before closing.

---

## Testing Strategy

### Unit Tests

No test runner configured — no unit tests in this change.

### Integration Tests

None in this change.

### Manual Testing Steps

1. Phase 1: `npm run dev` → click "Start conversation" on any lesson card → verify DB row + navigation to 404
2. Phase 2: REPL call to `buildSystemPrompt` with and without vocabulary
3. Phase 3: session URL with valid/invalid/ended session IDs
4. Phase 4: Full US-01 acceptance scenario:
   - Create a lesson with subject "Planning a trip" and goal "Ask for travel recommendations"
   - Start a session from that lesson card
   - Verify: AI greeting is in English, mentions the lesson topic, asks an opening question
   - Record: "What's the best way to get to London?"
   - Verify: AI responds in English, stays on travel topic, 1–2 sentences
   - End session → verify DB state
5. Error path: disconnect network after recording starts → verify error + retry restores usable state

## Performance Considerations

The per-turn transcript save is a fire-and-forget upsert — no await, no UI blocking. The `endSessionAction` is the only await on the end path, and it includes a final `saveTranscript` call before `endSession`. The AI greeting on mount fires immediately after the component mounts; the session page SSR is fast (two small DB queries). No new performance concerns beyond what F-02 already addressed.

## Migration Notes

No schema changes. No new migration files.

## References

- Roadmap S-02: `context/foundation/roadmap.md`
- Voice pipeline plan (F-02): `context/changes/voice-pipeline-baseline/plan.md`
- DB schema + DAL plan (F-01): `context/changes/db-schema-data-access/plan.md`
- Lesson management plan (S-01): `context/changes/lesson-management/plan.md`
- Working voice loop pattern: `src/app/pipeline-test/page.tsx`
- Chat route (system prompt contract): `src/app/api/chat/route.ts`
- Session DAL: `src/db/queries/sessions.ts`
- Lesson DAL: `src/db/queries/lessons.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session server actions + lesson card activation

#### Automated

- [x] 1.1 npm run typecheck exits 0 — f84e4f4
- [x] 1.2 npm run lint exits 0 — f84e4f4

#### Manual

- [ ] 1.3 Clicking "Start conversation" on a lesson card navigates to /session/<uuid>
- [ ] 1.4 New session row with correct lesson_id appears in sessions table

### Phase 2: Lesson-aware system prompt builder

#### Automated

- [x] 2.1 npm run typecheck exits 0 — 2808b48
- [x] 2.2 npm run lint exits 0 — 2808b48

#### Manual

- [ ] 2.3 buildSystemPrompt output contains all 4 lesson fields (name, subject, conversationGoal, vocabulary)
- [ ] 2.4 buildSystemPrompt with vocabulary: null produces no blank vocabulary line

### Phase 3: Session page (Server Component)

#### Automated

- [x] 3.1 npm run typecheck exits 0
- [x] 3.2 npm run build exits 0

#### Manual

- [ ] 3.3 /session/<valid-id> renders stub placeholder without console errors
- [ ] 3.4 /session/00000000-0000-0000-0000-000000000000 returns 404
- [ ] 3.5 /session/<ended-session-id> redirects to /

### Phase 4: Conversation client (voice loop + AI greeting + persistence + end flow)

#### Automated

- [ ] 4.1 npm run typecheck exits 0
- [ ] 4.2 npm run lint exits 0
- [ ] 4.3 npm run build exits 0

#### Manual

- [ ] 4.4 AI greeting plays automatically on session page load (no button press)
- [ ] 4.5 AI greeting is in English, references lesson topic, ends with an opening question (US-01 AC)
- [ ] 4.6 Record + Stop: transcript appears, AI response streams and plays, both messages in conversation list
- [ ] 4.7 Transcript row in DB after first turn (saveTranscriptAction fired)
- [ ] 4.8 Error mid-turn: shows error + Try again button; session stays open; retry allows new recording
- [ ] 4.9 End session: AlertDialog confirm → ended_at set in DB → redirect to /
- [ ] 4.10 Final transcript in DB contains all messages including last turn
- [ ] 4.11 Mobile browser: layout usable, buttons tappable, voice loop functional
