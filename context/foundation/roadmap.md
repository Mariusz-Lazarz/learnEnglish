---
project: LearnEnglish
version: 1
status: draft
created: 2026-05-31
updated: 2026-05-31
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: LearnEnglish

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Anna understands English well but cannot produce speech naturally — her receptive competence runs ahead of productive fluency, and practice gets skipped whenever no human conversation partner is available. The product closes this gap by giving her an always-available AI teacher who lets her pick the topic, adapts to her level, and prioritizes keeping her talking over catching every mistake. The bet at the center of this product — the core product hypothesis, meaning the assumption the whole thing is built on and that, if wrong, would mean the product has no reason to exist — is that voice conversation with a patient, topic-aware AI is a meaningfully better substitute for a human conversation partner than any fixed-curriculum tool currently available.

## North star

**S-02: first live voice conversation (topic-based)** — the smallest end-to-end slice whose successful delivery would prove the core product hypothesis. If Anna can pick a lesson, speak into her phone, and hear a natural English response from the AI teacher within a conversational pause, the product has earned its right to exist; everything else builds on that proof.

> A note on terms: "north star" here means the smallest end-to-end user-visible slice that, if it works, proves the product's core hypothesis — placed as early in the implementation sequence as prerequisites allow, because everything else only matters if this works.

## At a glance

| ID    | Change ID                 | Outcome (user can …)                                               | Prerequisites     | PRD refs                                                                    | Status   |
| ----- | ------------------------- | ------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------- | -------- |
| F-01  | db-schema-data-access     | (foundation) DB schema live; lessons, sessions, transcripts in pg  | —                 | FR-001, FR-007                                                              | ready    |
| F-02  | voice-pipeline-baseline   | (foundation) STT → LLM → TTS pipeline wired as Next.js API route  | —                 | FR-017, FR-018                                                              | ready    |
| S-01  | lesson-management         | create, edit, and delete lessons                                   | F-01              | FR-001, FR-002, FR-003                                                      | proposed |
| S-02  | first-voice-conversation  | pick a lesson, talk with the AI teacher, end with transcript saved | F-01, F-02, S-01  | FR-004, FR-006, FR-007, FR-011, FR-012, FR-013, FR-014, FR-017, FR-018, US-01 | proposed |
| S-03  | session-library-resume    | view, delete, and resume past sessions                             | F-01, S-02        | FR-008, FR-009, FR-010, US-02                                               | proposed |
| S-04  | free-conversation-mode    | start a free conversation without a lesson topic                   | S-02              | FR-005                                                                      | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                | Chain                          | Note                                                                                                                    |
| ------ | -------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| A      | Data & lesson trunk  | `F-01` → `S-01` → `S-02`      | Main dependency trunk; market-feedback goal means reaching north star S-02 is the priority end of this chain.           |
| B      | Voice infrastructure | `F-02`                         | Parallel with Stream A through S-01; joins at S-02. Voice pipeline is the highest technical risk — build alongside lessons, not after. |
| C      | Session depth        | `S-03` / `S-04`                | Both join after S-02 and are parallel; sequence between them is a capacity call.                                        |

## Baseline

What's already in place in the codebase as of 2026-05-31 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Next.js App Router + Tailwind CSS v4 scaffold present (`src/app/layout.tsx`, `src/app/page.tsx`); only boilerplate, zero app UI built
- **Backend / API:** absent — no `src/app/api/` routes, no request handlers
- **Data:** absent — no DB driver, ORM, schema, or migration files in package.json or filesystem
- **Auth:** absent by design — PRD §Access Control explicitly excludes auth; not a gap
- **Deploy / infra:** present — GitHub Actions CI/CD wired (`.github/workflows/deploy.yml`), PM2 config present (`ecosystem.config.js`, instances: 1)
- **Observability:** absent — no logging library or error tracking in package.json

## Foundations

### F-01: DB schema & data access

- **Outcome:** (foundation) PostgreSQL schema live with lessons, sessions, and transcripts tables; a typed data-access layer is in place that all subsequent slices read and write.
- **Change ID:** db-schema-data-access
- **PRD refs:** FR-001 (lesson storage), FR-007 (transcript persistence)
- **Unlocks:** S-01 (lesson CRUD needs the lessons table), S-02 (session + transcript persistence), S-03 (reading past sessions for library and resume)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Lowest technical uncertainty in the project; sequenced first because every slice reads or writes the DB. The one risk is over-engineering the schema on day one — keep it to three tables and evolve as /10x-plan discovers actual query patterns.
- **Status:** ready

### F-02: Voice pipeline baseline

- **Outcome:** (foundation) STT → streaming LLM → TTS pipeline wired as a Next.js API route; the route accepts audio input, returns a streamed AI text response and a TTS audio URL (or audio stream), and meets the <3s response-start NFR in development.
- **Change ID:** voice-pipeline-baseline
- **PRD refs:** FR-017 (microphone input), FR-018 (TTS output)
- **Unlocks:** S-02 (first voice conversation depends on this pipeline), S-04 (free conversation reuses it without the lesson topic constraint)
- **Prerequisites:** —
- **Parallel with:** F-01, S-01
- **Blockers:** —
- **Unknowns:**
  - Which STT service (OpenAI Whisper API, browser Web Speech API, etc.) to use given the <3s latency budget? — Owner: user. Block: no.
  - Which LLM API and TTS provider (OpenAI, Anthropic + OpenAI TTS, etc.)? — Owner: user. Block: no.
- **Risk:** Highest technical uncertainty in the project. The <3s latency NFR is a hard product requirement — if the chosen STT + LLM + TTS chain consistently takes 4–5s, the product breaks its core promise. Build and test this foundation on the actual VPS under production conditions, not just localhost, before committing to a provider combination.
- **Status:** ready

## Slices

### S-01: Lesson management

- **Outcome:** user can create, edit, and delete lessons (name, subject, conversation goal, optional vocabulary)
- **Change ID:** lesson-management
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Straightforward CRUD; the main risk is the lesson form becoming over-engineered. Keep it to five fields max. The lesson template feeds the AI system prompt in S-02 — its schema must be finalized here and treated as a contract.
- **Status:** proposed

### S-02: First voice conversation (north star)

- **Outcome:** user can pick a lesson, start a voice session, speak to the AI teacher, hear a response in English within a conversational pause, and end the session with the transcript automatically saved
- **Change ID:** first-voice-conversation
- **PRD refs:** FR-004, FR-006, FR-007, FR-011, FR-012, FR-013, FR-014, FR-017, FR-018, US-01
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Will the chosen STT → LLM → TTS pipeline consistently meet the <3s latency NFR under real VPS + Cloudflare conditions (not just localhost)? — Owner: team. Block: no (verify during implementation; if it fails, loop back to F-02 provider choice).
- **Risk:** The north star slice — highest business risk. If the voice loop does not feel natural (dead air, stiff corrections, topic drift), the product fails to justify its own existence. Prioritize the AI system prompt and error-correction behavior (FR-012, FR-014) over UI polish.
- **Status:** proposed

### S-03: Session library & resume

- **Outcome:** user can view the list of past sessions, delete any session, and resume one to continue the conversation with full prior transcript context loaded
- **Change ID:** session-library-resume
- **PRD refs:** FR-008, FR-009, FR-010, US-02
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The resume flow (FR-010) loads prior transcript as LLM context — verify that token limits do not silently clip long sessions. The AI must not re-introduce the topic as if starting fresh (US-02 AC); this is a system-prompt design constraint, not just a data-loading task.
- **Status:** proposed

### S-04: Free conversation mode

- **Outcome:** user can start a free conversation session without selecting a lesson topic
- **Change ID:** free-conversation-mode
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — the voice pipeline from S-02 is reused; the only change is removing the lesson topic constraint from the AI system prompt. Main risk is scope creep: free mode should not introduce new UI surface beyond a single alternative entry point.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                     | Ready for `/10x-plan` | Notes                                                       |
| ---------- | ------------------------- | --------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| F-01       | db-schema-data-access     | Set up PostgreSQL schema: lessons, sessions, transcripts  | yes                   | Run `/10x-plan db-schema-data-access`                       |
| F-02       | voice-pipeline-baseline   | Wire STT → streaming LLM → TTS pipeline                   | yes                   | Run `/10x-plan voice-pipeline-baseline`; decide STT/LLM/TTS providers before planning |
| S-01       | lesson-management         | Lesson management: create, edit, delete                   | no                    | Needs F-01 done first                                       |
| S-02       | first-voice-conversation  | First voice conversation — north star                     | no                    | Needs F-01 + F-02 + S-01                                    |
| S-03       | session-library-resume    | Session library: view, delete, resume                     | no                    | Needs S-02; parallel with S-04                              |
| S-04       | free-conversation-mode    | Free conversation mode (no lesson required)               | no                    | Needs S-02; parallel with S-03                              |

## Open Roadmap Questions

_(none — PRD has no unresolved open questions; no cross-cutting decisions surfaced during roadmap generation)_

## Parked

- **End-of-session mistake summary (FR-015)** — Why parked: PRD §Non-Goals; deferred to v2. Adds end-of-session analysis complexity; core value is the conversation itself.
- **Topic suggestions at end of session (FR-016)** — Why parked: PRD §Non-Goals; deferred to v2 alongside FR-015.
- **Login / authentication** — Why parked: PRD §Non-Goals; single-user app by design; auth adds zero benefit.
- **AI-generated automatic lesson creation** — Why parked: PRD §Non-Goals; lessons are created manually by the user.
- **Post-session tests or quizzes** — Why parked: PRD §Non-Goals; assessment happens through conversation, not structured tests.
- **Multi-user access** — Why parked: PRD §Non-Goals; one-person app by design.
- **Native mobile app** — Why parked: PRD §Non-Goals; mobile browser is sufficient for v1.

## Done

_(Empty on first generation. `/10x-archive` appends entries here — and flips that item's Status to `done` — when a change whose Change ID matches a roadmap item is archived.)_
