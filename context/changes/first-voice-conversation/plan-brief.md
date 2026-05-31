# First Voice Conversation — Plan Brief

> Full plan: `context/changes/first-voice-conversation/plan.md`

## What & Why

Build S-02 — the product's north star slice. Anna picks a lesson, the app creates a session and navigates to a conversation page, the AI teacher greets her automatically in English (referencing the lesson topic), she speaks via push-to-talk, and the AI responds via synthesized voice. When she ends the session the transcript is saved to PostgreSQL. If this works, the core product hypothesis is proven.

## Starting Point

All three prerequisites are fully complete: DB schema + DAL (F-01), voice pipeline proven in production with <3s latency (F-02), lesson CRUD UI with a disabled "Start conversation" placeholder on each card (S-01). The `/api/chat` route already accepts an optional `systemPrompt` parameter; `saveTranscript`, `createSession`, and `endSession` are live in the DAL. The `pipeline-test` page demonstrates the exact voice loop this slice will productize.

## Desired End State

Clicking "Start conversation" on a lesson card creates a session and navigates to `/session/[id]`. The AI's greeting plays automatically — in English, naming the lesson topic, opening with a question (US-01 acceptance criteria). Push-to-talk voice loop runs for each turn, transcript is persisted per-turn, and "End session" (with confirmation) sets `ended_at` and returns to home.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| AI greeting trigger | Auto-call on page mount | US-01 AC says "AI greets her, confirms the topic" — no extra button | Plan |
| Greeting seed message | Hidden `{ role: 'user', content: 'Start' }` | API requires ≥1 message; seed is never stored in state or sent again | Plan |
| Recording mode | Manual push-to-talk | Identical to the VPS-verified pipeline-test pattern; VAD adds complexity | Plan |
| End session | AlertDialog confirm → endSessionAction → router.push('/') | Prevents accidental end; consistent with delete-lesson pattern from S-01 | Plan |
| Transcript save | Per-turn upsert (fire-and-forget) + final on end | Resilient to tab-close; `saveTranscript` is idempotent; no UI blocking | Plan |
| Tab-close handling | None (rely on per-turn saves) | `beforeunload` is unreliable on mobile; per-turn saves make it unnecessary | Plan |
| URL routing | `/session/[id]` | Session is the primary entity; works for future S-04 free-conversation sessions | Plan |
| System prompt fields | All 4 lesson fields | Maximizes behavioral context; vocabulary list enables natural word introduction | Plan |
| Error recovery | Inline error + "Try again" | Transient API errors shouldn't kill a session; retry restores clean state | Plan |
| Session page styling | shadcn/ui matching lessons page | Components already installed; north star slice must be product-quality | Plan |

## Scope

**In scope:** session creation action, `/session/[id]` page + conversation client, `buildSystemPrompt`, per-turn transcript persistence, AI auto-greeting, push-to-talk voice loop, "End session" confirmation flow, error + retry handling.

**Out of scope:** VAD, beforeunload saves, session resume (S-03), free conversation (S-04), session library, end-of-session summary (v2), any DB schema changes.

## Architecture / Approach

Server Component (`/session/[id]/page.tsx`) fetches session + lesson server-side and builds the system prompt, then passes ready-to-use props to `ConversationClient`. The client replicates the `pipeline-test` voice loop extended with: lesson-aware system prompt, turn atomicity (messages state updated only on full success), per-turn DB saves (fire-and-forget), and the end-session AlertDialog. No new API routes — existing `/api/chat`, `/api/transcribe`, `/api/tts` are unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Session actions + card activation | `startSessionAction`, `saveTranscriptAction`, `endSessionAction`; lesson card navigates to session page | Server action redirect pattern in Next.js 16 |
| 2. System prompt builder | `buildSystemPrompt(lesson)` covering all PRD AI behavior rules | System prompt too loose → AI drifts from topic |
| 3. Session page (Server Component) | `/session/[id]` fetches data, guards 404/ended, renders stub | `params` as `Promise<{id}>` in this Next.js version |
| 4. Conversation client | Full voice loop, AI greeting, per-turn saves, end flow | AI greeting mount effect + turn atomicity complexity |

**Prerequisites:** F-01, F-02, S-01 — all complete and VPS-deployed.  
**Estimated effort:** ~1 session across 4 phases (phases 1–3 are each small; phase 4 is the main build).

## Open Risks & Assumptions

- System prompt quality is behavioral, not testable by typecheck — the AI greeting (Phase 4 manual verification) is the real gate for the north star claim.
- `toTextStreamResponse()` returns plain text (confirmed by pipeline-test) — if the Vercel AI SDK ever changes this, the stream accumulation in the client breaks silently.
- Per-turn `saveTranscriptAction` is fire-and-forget; if the VPS Postgres connection drops mid-session, turns between the last successful save and the explicit end action could be lost. Acceptable for MVP single-user app.

## Success Criteria (Summary)

- AI greeting plays automatically on session load, in English, naming the lesson topic, ending with an opening question (US-01 AC verified).
- Full push-to-talk turn completes: transcript → AI response → TTS audio plays; both messages in DB transcript.
- "End session" confirmation sets `ended_at` in DB and returns user to home with all turns saved.
