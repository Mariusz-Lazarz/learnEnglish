# Session Library & Resume Implementation Plan

## Overview

Build the session library: a `/sessions` page where the user can view all past ended sessions (showing lesson name, date, and message count), delete them with a confirmation dialog, and resume one. Resuming creates a new session pre-seeded with the prior transcript so the AI picks up naturally from where the conversation left off.

## Current State Analysis

- DB and DAL are fully in place: `getAllSessions()` (LEFT JOIN lessons, ordered by `startedAt DESC`), `getSessionById()`, `deleteSession()`, `getTranscriptMessages()`, and the idempotent `saveTranscript()` upsert all exist in `src/db/queries/sessions.ts`.
- `SessionWithLesson` type (`src/db/queries/sessions.ts:8-10`) has: `id`, `lessonId`, `startedAt`, `endedAt`, `lessonName` — **missing `messageCount`**.
- Home page (`/`) shows only the lesson list; there is **no session history UI**.
- Session page (`src/app/session/[id]/page.tsx:18-20`) **redirects to `/` if `endedAt !== null`** — ended sessions are currently inaccessible.
- `ConversationClient` (`src/app/session/[id]/_components/conversation-client.tsx`) props are `{ sessionId, lessonName, systemPrompt }` — **no slot for prior messages**.
- Session and lesson delete confirmation follow an identical AlertDialog pattern (`src/app/_components/delete-lesson-alert.tsx`) — reusable template for session delete.

## Desired End State

The user can navigate from the home page to `/sessions`, see all completed sessions listed with lesson name, date, and message count, delete any session with a confirmation dialog, and resume any session. Resuming opens a fresh session page where the AI greets the user with a brief welcome-back acknowledgment (not a fresh topic introduction), and subsequent turns use the full prior transcript as conversation context.

### Key Discoveries

- `src/db/queries/sessions.ts:12-25` — `getAllSessions()` already does a LEFT JOIN with lessons; extending it to join transcripts and compute `jsonb_array_length(messages)` adds message count with no schema migration.
- `src/db/queries/sessions.ts:72-78` — `getTranscriptMessages(sessionId)` returns `Message[]`, returns `[]` if no transcript.
- `src/app/actions/sessions.ts:59-70` — `saveTranscript` is an idempotent upsert on `sessionId`; calling it on a brand-new session with prior messages pre-seeds the transcript.
- `src/app/session/[id]/_components/conversation-client.tsx:61-103` — `runAIGreeting()` sends seed `{ role: 'user', content: 'Start' }` (not stored); the resume variant will send `{ role: 'user', content: 'Resume our previous conversation.' }` with full prior history prepended.
- `src/app/_components/lesson-list.tsx` — client component that owns the home page header; the "Past sessions" nav link belongs here.

## What We're NOT Doing

- No read-only transcript view — sessions are either resumed or deleted.
- No truncation of prior transcript for the LLM context — full history is sent (GPT-4o mini has a 128k token window; v1 sessions are short).
- No `resumedFrom` FK or schema migration — resumption is tracked purely by the presence of pre-seeded messages in the new session's transcript.
- No pagination or filtering on the sessions page — simple date-ordered list for v1.
- No global nav bar — a single link in the home page header is sufficient.
- No active (in-progress) sessions shown in the library — only ended sessions.

## Implementation Approach

Three phases in dependency order. Phase 1 extends the backend so the UI has the data it needs. Phase 2 builds the `/sessions` page using that data. Phase 3 updates the session page and `ConversationClient` to handle the resume case, which relies on Phase 1's `resumeSessionAction` pre-seeding the transcript.

The key design insight is using `saveTranscript`'s idempotent upsert as the resume mechanism: `resumeSessionAction` creates a new session and immediately saves the old transcript into it. The session page then calls `getTranscriptMessages` on the new session — if messages exist, it treats the session as a resume and passes them to `ConversationClient` as `initialMessages`.

## Critical Implementation Details

**PostgreSQL jsonb function**: message count uses `jsonb_array_length()` (not `json_array_length()`), because `transcripts.messages` is declared as `jsonb` in the schema (`src/db/schema.ts:36`). Wrap in `COALESCE(..., 0)` to handle sessions with no transcript row (LEFT JOIN may yield NULL).

**Resume greeting seed is not persisted**: the seed message `{ role: 'user', content: 'Resume our previous conversation.' }` is sent to `/api/chat` alongside the stripped-timestamp prior history but is never stored in state or transcript. Only the AI's response is stored — same pattern as the `'Start'` seed in `runAIGreeting()`.

**Timestamp stripping contract**: prior messages must have timestamps stripped before sending to `/api/chat` — existing pattern from `conversation-client.tsx:160`.

---

## Phase 1: DAL Extension & Server Actions

### Overview

Extend the data access layer to expose ended sessions with message count, then add two server actions: `deleteSessionAction` and `resumeSessionAction`. No schema migration needed.

### Changes Required

#### 1. Add `getAllEndedSessions` and update `SessionWithLesson` type

**File**: `src/db/queries/sessions.ts`

**Intent**: Add a new export that returns only completed sessions enriched with message count. Existing `getAllSessions()` stays unchanged.

**Contract**: Update `SessionWithLesson` to add `messageCount: number`. Add `getAllEndedSessions(): Promise<SessionWithLesson[]>` that LEFT JOINs `transcripts` on `transcripts.sessionId = sessions.id`, computes `COALESCE(jsonb_array_length(transcripts.messages), 0)` as `messageCount`, filters `sessions.endedAt IS NOT NULL`, and orders by `sessions.startedAt DESC`. Import the `transcripts` table from `../schema` (already in the same file's schema import).

#### 2. Add `deleteSessionAction`

**File**: `src/app/actions/sessions.ts`

**Intent**: Server action for deleting an ended session; revalidates the sessions page so the list updates immediately.

**Contract**: `deleteSessionAction(sessionId: string): Promise<{ error: string } | undefined>`. Calls `deleteSession(sessionId)`, then `revalidatePath('/sessions')`. Returns `{ error: string }` on exception, `undefined` on success. Pattern is identical to `deleteLessonAction` in `src/app/actions/lessons.ts:48-57`.

#### 3. Add `resumeSessionAction`

**File**: `src/app/actions/sessions.ts`

**Intent**: Creates a new session pre-seeded with the old session's transcript, so the session page can detect the resume case purely by checking if transcript messages exist.

**Contract**: `resumeSessionAction(oldSessionId: string): Promise<{ newSessionId: string } | { error: string }>`. Steps in order:
1. `getSessionById(oldSessionId)` — if not found, return `{ error: 'Session not found' }`.
2. `getTranscriptMessages(oldSessionId)` — capture `priorMessages`.
3. `createSession(oldSession.lessonId ?? undefined)` — new session with same lesson (or free if no lessonId).
4. If `priorMessages.length > 0`: `saveTranscript(newSession.id, priorMessages)` — pre-seeds transcript.
5. Return `{ newSessionId: newSession.id }`.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Calling `getAllEndedSessions()` (via a temporary log or the sessions page in Phase 2) returns only sessions where `endedAt` is set, each with a numeric `messageCount`.
- Calling `resumeSessionAction(existingSessionId)` creates a new session row in the DB and its transcript is pre-populated with the prior messages.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: /sessions Page & Navigation

### Overview

Build the full sessions library UI: a Server Component page at `/sessions`, three client components (session list, session card, delete alert), and a "Past sessions" link in the home page header.

### Changes Required

#### 1. Sessions page (Server Component)

**File**: `src/app/sessions/page.tsx`

**Intent**: Server Component that fetches all ended sessions and renders the client list component.

**Contract**: `async function SessionsPage()` — `'use server'` is implied (no directive needed for Server Components). Calls `getAllEndedSessions()` from `@/db`. Renders `<SessionList sessions={sessions} />`. No layout wrapper beyond what the root `layout.tsx` provides.

#### 2. Session list component

**File**: `src/app/sessions/_components/session-list.tsx`

**Intent**: Client component that renders the session library header, empty state, and the grid of session cards. Manages delete alert open state.

**Contract**: `'use client'`. Props: `{ sessions: SessionWithLesson[] }`. State: `deleteSessionId: string | null`. Renders:
- Header with "Past sessions" h1 and a `<Link href="/">← Lessons</Link>` back link.
- Empty state paragraph if `sessions.length === 0`.
- Responsive grid (same 3-column-on-lg as `LessonList`) of `<SessionCard>` components, each with `onDelete={() => setDeleteSessionId(session.id)}`.
- `<DeleteSessionAlert open={deleteSessionId !== null} sessionId={deleteSessionId ?? ''} onOpenChange={(open) => { if (!open) setDeleteSessionId(null); }} />` — rendered once outside the grid.

#### 3. Session card component

**File**: `src/app/sessions/_components/session-card.tsx`

**Intent**: Shows session summary and provides Resume / Delete actions. Resume calls `resumeSessionAction` and navigates to the new session.

**Contract**: `'use client'`. Props: `{ session: SessionWithLesson; onDelete: () => void }`. Displays:
- Lesson name (`session.lessonName ?? 'Free conversation'`).
- `session.startedAt` formatted as a human-readable date (e.g. `new Date(session.startedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })`).
- `session.messageCount` messages.

Actions:
- **Resume button**: `useTransition` + `useRouter`. `onClick` → `startTransition(async () => { const result = await resumeSessionAction(session.id); if ('newSessionId' in result) router.push('/session/' + result.newSessionId); else setResumeError(result.error); })`. Disabled during transition; shows spinner from `lucide-react`. Inline error display if `resumeError` is set.
- **Delete button**: calls `onDelete()` — opens the alert via parent state, same indirect pattern as lesson delete.

Use shadcn/ui `Card`, `CardHeader`, `CardContent`, `CardFooter`, and `Button` (already installed).

#### 4. Delete session alert component

**File**: `src/app/sessions/_components/delete-session-alert.tsx`

**Intent**: Confirmation dialog before deleting a session. Mirrors `src/app/_components/delete-lesson-alert.tsx` exactly.

**Contract**: `'use client'`. Props: `{ sessionId: string; open: boolean; onOpenChange: (open: boolean) => void }`. On confirm: calls `deleteSessionAction(sessionId)`. On error: displays error inline without closing the dialog. On success: calls `onOpenChange(false)`. Use the same shadcn/ui `AlertDialog` setup as the lesson delete alert.

#### 5. "Past sessions" link on home page

**File**: `src/app/_components/lesson-list.tsx`

**Intent**: Add a navigation link to `/sessions` in the home page header so the user can find the session library.

**Contract**: Import `Link` from `'next/link'`. In the header area alongside the "New lesson" button, add `<Link href="/sessions" className="...">Past sessions</Link>` using shadcn/ui `Button` with `asChild` or `variant="outline"` — visually distinct from the primary "New lesson" action.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Navigating to `/sessions` shows the list of ended sessions with lesson name, formatted date, and message count per card.
- Sessions without a transcript (no messages) show `0 messages` without error.
- Clicking Delete on a card opens the AlertDialog; confirming removes the session from the list.
- The "Past sessions" link on the home page header navigates to `/sessions`.
- The "← Lessons" back link on `/sessions` navigates to `/`.
- Free-conversation sessions (no lesson) display "Free conversation" as the label.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Resume Conversation Flow

### Overview

Update the session page to detect pre-seeded transcripts (the resume signal) and pass them to `ConversationClient`. Update `ConversationClient` to skip the standard greeting and instead run a "welcome back" acknowledgment turn using the full prior history.

### Changes Required

#### 1. Session page — detect resume and pass initialMessages

**File**: `src/app/session/[id]/page.tsx`

**Intent**: After fetching the session, check if a transcript is already pre-seeded. If so, pass the prior messages as `initialMessages` to ConversationClient so it enters resume mode.

**Contract**: After the existing `getLessonById` call (line 22), add:
```
const priorMessages = await getTranscriptMessages(session.id);
```
Pass `initialMessages={priorMessages.length > 0 ? priorMessages : undefined}` to `<ConversationClient>`. Import `getTranscriptMessages` from `@/db`.

#### 2. ConversationClient — initialMessages prop + resume acknowledgment

**File**: `src/app/session/[id]/_components/conversation-client.tsx`

**Intent**: Accept optional `initialMessages` prop. When provided, populate the messages state before mount and run a resume-specific initial turn (welcome-back acknowledgment) instead of the standard AI greeting.

**Contract**:

**Props** — add `initialMessages?: Message[]` to the existing props interface (lines 22–26).

**State initialization** — change the `messages` useState initial value:
```
useState<Message[]>(initialMessages ?? [])
```
This populates prior messages synchronously before first render.

**Mount effect** — update the `useEffect` that calls `runAIGreeting()` (lines 44–49) to branch on `initialMessages`:
```
if (initialMessages && initialMessages.length > 0) {
  runResumeAcknowledgment();
} else {
  runAIGreeting();
}
```

**`runResumeAcknowledgment()` function** — add alongside `runAIGreeting()`. Structure identical to `runAIGreeting()` with two differences:
1. The messages sent to `/api/chat` are the full prior history stripped of timestamps, plus the seed appended at the end: `[...initialMessages.map(({ role, content }) => ({ role, content })), { role: 'user', content: 'Resume our previous conversation.' }]`. The seed is never stored.
2. The resulting assistant message is appended to `messages` state (which already contains the prior messages), then `saveTranscriptAction(sessionId, [...initialMessages, assistantMessage])` is fired-and-forgotten.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Clicking Resume on a session card in `/sessions` navigates to a new `/session/[id]` page.
- The prior conversation messages are visible in the chat list before the AI speaks.
- The AI sends a brief welcome-back response (not a topic re-introduction) without the user needing to speak first.
- After the AI's welcome-back response, recording and the standard voice loop function normally.
- The new session's transcript persists: ending the resumed session saves both the prior history and the new turns.
- The resumed session appears in the session library after it is ended.
- A brand-new session (no `initialMessages`) still runs the standard AI greeting without regression.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps

1. Create a lesson, start a session, exchange 3–4 turns, end the session.
2. Navigate to `/sessions` via the home page header link — verify the session card shows the correct lesson name, date, and message count.
3. Delete the session — verify the confirmation dialog and removal from the list.
4. Create another session, end it, then click Resume — verify the new session page shows prior messages and the AI sends a welcome-back message.
5. Carry out one more turn in the resumed session, end it — verify it appears in `/sessions` as a new card.
6. Start a brand-new session from a lesson — verify the standard AI greeting still fires correctly (no regression).

### Edge Cases to Verify

- Session with no messages (ended immediately): message count shows 0; resuming starts a fresh session without pre-seeded transcript, so standard AI greeting fires.
- Free-conversation session (no `lessonId`): shows "Free conversation" label; resume creates a new free session with prior context.
- Deleting a session cascades transcript deletion via the `sessions.id → transcripts.session_id CASCADE DELETE` FK.

## References

- Roadmap S-03: `context/foundation/roadmap.md`
- Session DAL: `src/db/queries/sessions.ts`
- Existing delete pattern: `src/app/_components/delete-lesson-alert.tsx`
- ConversationClient greeting: `src/app/session/[id]/_components/conversation-client.tsx:61-103`
- Session page: `src/app/session/[id]/page.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DAL Extension & Server Actions

#### Automated

- [x] 1.1 TypeScript compiles without errors: `npm run build` — 88aa339
- [x] 1.2 Lint passes: `npm run lint` — 88aa339

#### Manual

- [ ] 1.3 `getAllEndedSessions()` returns only ended sessions each with a numeric `messageCount`
- [ ] 1.4 `resumeSessionAction` creates a new session with the prior transcript pre-seeded

### Phase 2: /sessions Page & Navigation

#### Automated

- [x] 2.1 TypeScript compiles without errors: `npm run build` — db79c30
- [x] 2.2 Lint passes: `npm run lint` — db79c30

#### Manual

- [ ] 2.3 `/sessions` renders ended sessions with lesson name, date, and message count
- [ ] 2.4 Sessions with no transcript show `0 messages` without error
- [ ] 2.5 Delete flow opens AlertDialog and removes session from list on confirm
- [ ] 2.6 "Past sessions" link on home page navigates to `/sessions`
- [ ] 2.7 "← Lessons" back link on `/sessions` navigates to `/`
- [ ] 2.8 Free-conversation sessions display "Free conversation" label

### Phase 3: Resume Conversation Flow

#### Automated

- [x] 3.1 TypeScript compiles without errors: `npm run build` — acb14c2
- [x] 3.2 Lint passes: `npm run lint` — acb14c2

#### Manual

- [ ] 3.3 Resuming a session navigates to a new session page with prior messages visible
- [ ] 3.4 AI sends a welcome-back acknowledgment (not a fresh topic introduction)
- [ ] 3.5 Standard voice loop functions normally after the welcome-back turn
- [ ] 3.6 Ending a resumed session saves both prior and new turns
- [ ] 3.7 Brand-new session still shows standard AI greeting (no regression)
