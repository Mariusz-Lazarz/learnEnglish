# Free Conversation Mode — Plan Brief

> Full plan: `context/changes/free-conversation-mode/plan.md`

## What & Why

Enable starting a voice conversation without selecting a lesson topic (PRD FR-005). Anna should be able to open the app and just talk — no lesson required. The voice pipeline, AI system prompt, DB schema, and session page already support this path; the only missing pieces are a relaxed server action type and a UI button.

## Starting Point

`startSessionAction` requires a `lessonId: string`, blocking no-lesson sessions. `LessonList` has no entry point for free conversation. Everything else — the `FREE_CONVERSATION_SYSTEM_PROMPT`, nullable `lessonId` in the DB, the session page's null-lesson handling, and the "Free conversation" label in the session library — is already implemented.

## Desired End State

The home page header shows "Free conversation" (outline) | "Past sessions" | "New lesson". Clicking it creates a session, navigates to `/session/[id]`, and the AI greets in English and asks what the student wants to talk about. When no lessons exist, the empty state also offers "Or start a free conversation" as an alternative to lesson creation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Entry point location | Header toolbar | No new UI surface; always visible regardless of lesson count | Plan |
| Button label | "Free conversation" | Matches the label already used in session cards and the library view | Plan |
| Button style | Outline (secondary) | "New lesson" stays the clear primary CTA | Plan |
| Empty state | Show both options | User is never stuck on day one before creating a lesson | Plan |
| Greeting seed | Keep `'Start'` unchanged | `FREE_CONVERSATION_SYSTEM_PROMPT` already instructs the AI to open with "what would you like to talk about" | Plan |
| Action signature | `lessonId?: string` | `createSession` already accepts undefined; no DB change needed | Plan |

## Scope

**In scope:** Server action type change; LessonList header button; LessonList empty-state secondary button; loading/error UX matching the lesson-card pattern.

**Out of scope:** New routes or components; DB schema changes; voice pipeline changes; ConversationClient changes; API route changes; new UI surface beyond the two button additions.

## Architecture / Approach

Single-path reuse: the free-conversation path shares every layer with the lesson-based path — same API routes, same session page, same ConversationClient, same `runAIGreeting()` seed. The only branch is at `startSessionAction` (lessonId becomes optional) and in the session page (already branched on `lesson === null` since S-02).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Relax action signature | `startSessionAction()` callable with no argument | Trivial — one character change to a type annotation |
| 2. LessonList UI entry points | "Free conversation" button in header + empty state | Need to follow the exact lesson-card navigation pattern to avoid introducing a different error-handling style |

**Prerequisites:** S-02 (first-voice-conversation) must be merged — the session page's null-lessonId handling landed there.

**Estimated effort:** ~1 session, 2 small changes, ~30 lines of code.

## Open Risks & Assumptions

- S-02 is assumed merged and the session page null-lessonId handling is live in the branch being built on (confirmed from codebase read).
- No token-limit risk for free sessions (no prior transcript on session start; same as a new lesson session).

## Success Criteria (Summary)

- User can click "Free conversation" from home and reach a live voice session with an open-ended AI greeting.
- Ended free session appears in `/sessions` labelled "Free conversation".
- Empty state offers free conversation as an alternative to lesson creation.
