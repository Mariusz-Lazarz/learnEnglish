# Session Library & Resume — Plan Brief

> Full plan: `context/changes/session-library-resume/plan.md`

## What & Why

Build the session library (FR-008, FR-009, FR-010): a `/sessions` page where the user can view past completed sessions, delete them, and resume one to continue talking with the AI from where they left off. The product's secondary success criterion ("sessions are saved and she can return to, review, or delete them later") depends entirely on this slice.

## Starting Point

The DB and DAL have everything needed: `getAllSessions()`, `getTranscriptMessages()`, `deleteSession()`, and the idempotent `saveTranscript()` upsert are all in place. There is no session history UI — the home page shows only lessons, and ended sessions are currently inaccessible (the session page redirects away from them).

## Desired End State

The user can click "Past sessions" on the home page, see a list of completed sessions with lesson name, date, and message count, delete any with a confirmation dialog, and resume any — whereupon the AI greets them with a brief welcome-back acknowledgment (not a fresh topic introduction) and prior conversation history is visible and active as context.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Where session library lives | Separate `/sessions` page | Keeps home page focused on lesson management; scales cleanly | Plan |
| Message count source | `jsonb_array_length()` in DAL query | No schema migration; computable at query time with LEFT JOIN | Plan |
| Delete confirmation | AlertDialog (same as lesson delete) | Transcript is non-recoverable; consistent with existing UX | Plan |
| Resume model | New session row, prior transcript pre-seeded | Clean data model — no `endedAt` mutation, no schema change | Plan |
| Resume AI behavior | Brief "welcome back" acknowledgment | Satisfies US-02 AC: AI must not re-introduce topic as if starting fresh | Plan |
| View-only transcript | Out of scope | PRD (FR-008–010) doesn't require it; defer to later slice | Plan |
| Token limit handling | Full transcript, no truncation | GPT-4o mini has 128k context; v1 sessions are short | Plan |
| Nav link placement | Home page header (in LessonList) | Discoverable without adding a global nav bar | Plan |

## Scope

**In scope:**
- `getAllEndedSessions()` DAL function with message count
- `deleteSessionAction` and `resumeSessionAction` server actions
- `/sessions` page with session list, card, and delete alert components
- "Past sessions" nav link on home page header
- `ConversationClient` resume mode: `initialMessages` prop + welcome-back acknowledgment turn

**Out of scope:**
- Read-only transcript view
- Pagination or filtering on sessions list
- `resumedFrom` FK or schema migration
- Global nav bar

## Architecture / Approach

`resumeSessionAction` is the key mechanism: it creates a new session and immediately calls `saveTranscript(newSessionId, priorMessages)` — using the existing idempotent upsert to pre-seed the new session's transcript. The session page (`/session/[id]/page.tsx`) then calls `getTranscriptMessages(session.id)` — if messages exist, it passes them as `initialMessages` to `ConversationClient`, which populates state before render and runs a resume-specific initial LLM turn instead of the standard greeting.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DAL + Actions | `getAllEndedSessions`, `deleteSessionAction`, `resumeSessionAction` | Drizzle `sql` template with `jsonb_array_length` must be syntactically correct |
| 2. /sessions UI + nav | Full sessions page, card, delete flow, home nav link | Follow existing component patterns to avoid scope creep |
| 3. Resume flow | Session page resume detection + ConversationClient resume greeting | Welcome-back seed message must not re-introduce topic (system prompt + history must be wired correctly) |

**Prerequisites:** F-01 (DB schema) and S-02 (first voice conversation) — both done.  
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- The `resumedFrom` lineage is not tracked — two session rows exist for one logical conversation thread. Acceptable for v1; a future slice could link them if needed.
- If a session is ended before any messages are exchanged (`messages.length === 0`), resuming creates a new session with an empty transcript and falls through to the standard AI greeting — correct behavior.

## Success Criteria (Summary)

- User can navigate to `/sessions`, see past sessions with lesson name, date, and message count.
- Deleting a session removes it from the list (transcript cascade-deleted via FK).
- Resuming a session opens a new conversation with prior messages visible and the AI sending a welcome-back (not a fresh greeting) before the user speaks.
