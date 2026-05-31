# Free Conversation Mode Implementation Plan

## Overview

Enable starting a voice conversation session without selecting a lesson topic (FR-005). The voice pipeline, system prompt, DB schema, and session page already handle the free-conversation path — only one type signature and one UI component need to change.

## Current State Analysis

- `FREE_CONVERSATION_SYSTEM_PROMPT` is already defined and exported from `src/lib/system-prompt.ts:22`
- `session/[id]/page.tsx:22-30` already handles `null` lessonId: selects the free-conversation system prompt and passes `lessonName='Free conversation'` to `ConversationClient`
- `src/db/queries/sessions.ts`: `createSession(lessonId?: string)` already accepts undefined; the DB schema has `lessonId` as nullable
- `resumeSessionAction` already uses `oldSession.lessonId ?? undefined`, so resumed free sessions work too
- The session card in `/sessions` already displays "Free conversation" for null-lesson sessions (`session.lessonName ?? 'Free conversation'`)
- `startSessionAction` is the only gating point — it requires `lessonId: string`, blocking the free-conversation call path
- `LessonList` has no entry point for free conversation; it only has "Past sessions" and "New lesson" in its header

## Desired End State

The header of the home page shows three buttons: "Free conversation" (outline) | "Past sessions" (outline) | "New lesson" (primary). Clicking "Free conversation" creates a session with no lesson, navigates to `/session/[id]`, and the AI greets the user in English and asks what they'd like to talk about. When no lessons exist, the empty state also shows a secondary "Or start a free conversation" button alongside "Create your first lesson".

To verify: click "Free conversation" from home, observe the AI greeting with an open question (not a topic confirmation), end the session, check `/sessions` shows the entry labelled "Free conversation".

### Key Discoveries

- `src/app/actions/sessions.ts:7` — `startSessionAction(lessonId: string)` is the only blocker; changing to `lessonId?: string` is sufficient since `createSession` already accepts undefined
- `src/app/_components/lesson-list.tsx:22-26` — header div uses `flex justify-end gap-2`; adding a third outline button is a one-liner
- `src/app/_components/lesson-card.tsx:50-57` — the established pattern for session start: `useTransition` + `startSessionAction(id)` + `router.push('/session/' + result.sessionId)` — reuse verbatim in LessonList

## What We're NOT Doing

- No new route, page, or component
- No DB schema changes
- No changes to the voice pipeline, API routes, or `ConversationClient`
- No changes to the AI greeting seed (`'Start'` works correctly with `FREE_CONVERSATION_SYSTEM_PROMPT`)
- No changes to `buildSystemPrompt` or session page

## Implementation Approach

Two targeted changes. Phase 1 makes the server action accept an optional lessonId. Phase 2 wires the UI button that calls it.

---

## Phase 1: Relax startSessionAction Signature

### Overview

Remove the `lessonId: string` requirement from the server action so it can be called with no argument for free-conversation sessions.

### Changes Required

#### 1. Server action type signature

**File**: `src/app/actions/sessions.ts`

**Intent**: Make `lessonId` optional so callers can start a free-conversation session without providing a lesson ID.

**Contract**: Change the parameter from `lessonId: string` to `lessonId?: string`. The function body passes it directly to `createSession(lessonId)`, which already accepts `string | undefined` — no further changes needed.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Calling `startSessionAction()` (no argument) from the browser console or a test button does not throw a TypeScript or runtime error and returns `{ sessionId: string }`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: LessonList UI Entry Points

### Overview

Add the "Free conversation" button to the `LessonList` header and the empty state, following the exact navigation pattern established in `LessonCard`.

### Changes Required

#### 1. LessonList component

**File**: `src/app/_components/lesson-list.tsx`

**Intent**: Add a free-conversation entry point in the header toolbar and in the no-lessons empty state, with loading and error handling matching the existing lesson-card pattern.

**Contract**: Add the following imports: `useTransition` and `useRouter` (already available from react/next), `Loader2` from `lucide-react`, `startSessionAction` from `@/app/actions/sessions`. Add `useRouter()`, `useTransition()`, and `useState<string | null>(null)` for the free-start pending/error state. The header `div.flex` gets a new `<Button variant="outline">Free conversation</Button>` as its first child (before "Past sessions"). The empty-state block gains a second button below the existing one. An error line (`<p className="text-right text-sm text-destructive">`) appears below the header div when `freeStartError` is non-null.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- "Free conversation" button appears in the home page header toolbar
- Clicking it shows a loading spinner on the button while the session is being created
- After creation, navigates to `/session/[id]` and the AI greets in English with an open question (no topic confirmation)
- Ending the session and visiting `/sessions` shows the entry labelled "Free conversation"
- When no lessons exist, "Or start a free conversation" appears below "Create your first lesson" in the empty state and works identically
- A simulated network error (e.g., DB down) shows an inline error message near the button, not a crash

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps

1. Home page with lessons: click "Free conversation" → verify navigation to session page, AI greeting opens with a question (not a topic name)
2. End the session → visit `/sessions` → confirm entry is labelled "Free conversation"
3. Home page with no lessons: verify "Or start a free conversation" is visible and works
4. Resume a free-conversation session from `/sessions` → confirm AI acknowledges the prior context without re-introducing a topic

## References

- Roadmap: S-04 (`context/foundation/roadmap.md`)
- PRD: FR-005 (`context/foundation/prd.md`)
- Session start pattern: `src/app/_components/lesson-card.tsx:44-76`
- System prompt: `src/lib/system-prompt.ts:22-29`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Relax startSessionAction Signature

#### Automated

- [x] 1.1 TypeScript compiles without errors: `npm run build` — 36cb75b
- [x] 1.2 Lint passes: `npm run lint` — 36cb75b

#### Manual

- [ ] 1.3 `startSessionAction()` called with no argument returns `{ sessionId: string }` without error

### Phase 2: LessonList UI Entry Points

#### Automated

- [x] 2.1 TypeScript compiles without errors: `npm run build` — f1a42c2
- [x] 2.2 Lint passes: `npm run lint` — f1a42c2

#### Manual

- [ ] 2.3 "Free conversation" button visible in header; clicking navigates to session with open AI greeting
- [ ] 2.4 Ended free session appears in `/sessions` labelled "Free conversation"
- [ ] 2.5 Empty state shows "Or start a free conversation" and navigates correctly
- [ ] 2.6 Resumed free session: AI continues without re-introducing a topic
