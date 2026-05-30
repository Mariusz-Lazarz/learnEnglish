---
project: "LearnEnglish"
version: 1
status: draft
created: 2026-05-30
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

She understands English well but cannot produce speech naturally — a classic passive learner gap where receptive competence runs ahead of productive fluency. No on-demand conversation partner exists who can discuss any topic she chooses with both depth and patience. Practice gets skipped when no suitable human is available; the gap between what she understands and what she can say never closes.

The insight: existing tools (Duolingo, language exchange apps) either run fixed curricula or require scheduling with real people. Neither gives her an always-available partner who lets her pick the topic, adapts to her comfort level, and prioritizes getting her to *talk* over catching every error.

## User & Persona

**Primary persona: Anna** (working name)

- Role: English learner at intermediate level — good comprehension, low spoken fluency
- Context: Learns outside of formal classes; practice happens at home in her own time
- Moment she reaches for this product: She wants to practice speaking on a specific topic but her available human partner (her boyfriend) either isn't free or can't carry the topic with sufficient depth
- Core need: A conversation partner that feels natural, follows her chosen topic, and keeps her talking rather than freezing up

## Success Criteria

### Primary
- She can open the app, pick a lesson topic (or start a free conversation session), and have a real back-and-forth voice conversation with an AI teacher that stays on topic and corrects her naturally mid-conversation.

### Secondary
- Sessions are saved and she can return to, review, or delete them later.
- End-of-session summary includes 2–3 concrete topic suggestions relevant to her errors.

### Guardrails
- Her voice audio is never stored on the server — only transcript or metadata if needed.
- AI communicates in English only — never switches to Polish or any other language.
- When a topic-based session is active, the AI never drifts off that topic.
- App works on mobile browser — she can practice on her phone.

## User Stories

### US-01: Starting a lesson session

- **Given** the user has at least one lesson created
- **When** she selects a lesson and starts a session
- **Then** the AI greets her in English, confirms the topic, and opens with a question to begin the conversation

#### Acceptance Criteria
- AI's first message is always in English
- AI references the lesson topic in the opening
- Microphone activates and her voice is transmitted to the AI

### US-02: Resuming a past session

- **Given** the user has at least one saved session
- **When** she opens a past session from the session list
- **Then** the AI has full context of the prior conversation and continues naturally from where they left off

#### Acceptance Criteria
- AI does not re-introduce the topic as if starting fresh
- Prior conversation text is loaded as context

## Functional Requirements

### Lessons
- FR-001: User can create a lesson with name, subject, conversation goal, and optional key vocabulary. Priority: must-have
- FR-002: User can edit an existing lesson. Priority: must-have
- FR-003: User can delete a lesson. Priority: must-have

### Sessions
- FR-004: User can start a new voice conversation session from a chosen lesson (topic-based). Priority: must-have
- FR-005: User can start a free conversation session with no topic constraint. Priority: must-have
  > Socrates: Counter-argument considered: "free conversation lets her avoid structured lessons." Resolution: kept — free conversation is used for casual/informal talking, not to escape structure.
- FR-006: User can end a session at any time. Priority: must-have
- FR-007: Session conversation transcript (text) is saved automatically when the session ends — no audio stored. Priority: must-have
  > Socrates: Counter-argument considered: "no value in storing a full transcript if she never reads it." Resolution: revised — transcript is stored so she can resume the conversation, not just review it. Audio storage remains excluded.
- FR-008: User can view the list of past sessions. Priority: must-have
- FR-009: User can delete a past session. Priority: must-have
- FR-010: User can resume a past session and continue the conversation from where it left off. Priority: must-have

### AI Conversation
- FR-011: AI conducts the conversation in English only — never uses another language. Priority: must-have
- FR-012: In a topic-based session, AI stays on the lesson topic and does not drift. Priority: must-have
- FR-013: AI leads the conversation — asks questions, keeps the flow going, does not wait passively. Priority: must-have
  > Socrates: Counter-argument considered: "always AI-led keeps her in reactive mode; she never practices initiating." Resolution: kept — her core problem is producing any speech at all; building confidence to respond is step one.
- FR-014: AI corrects only major errors mid-conversation — invented words, serious structural mistakes. Does NOT correct articles, contractions, or minor slips. Priority: must-have
  > Socrates: Counter-argument considered: "any mid-conversation correction breaks flow." Resolution: scope narrowed — only errors that would confuse a native listener; minor grammar noise is ignored.
- FR-015: At session end, AI delivers a summary of major mistakes. Priority: nice-to-have (v2)
  > Socrates: Adds end-of-session analysis complexity. Deferred to v2 — core value is the conversation itself.
- FR-016: At session end, AI suggests 2–3 topics for further practice based on the session. Priority: nice-to-have (v2)
  > Socrates: Requires session-level analysis. Deferred to v2 alongside FR-015.

### Voice
- FR-017: User speaks to the AI using their device microphone. Priority: must-have
- FR-018: AI responds via synthesised voice (text-to-speech). Priority: must-have

## Non-Functional Requirements

- The learner hears the AI's response within a natural conversational gap — no perceptible dead air longer than what a human pause would feel like (target: AI audio starts within 3 seconds of her finishing speaking).
- The app works on the latest two major versions of mainstream mobile and desktop browsers — no installation required.
- Voice audio captured from the learner's microphone is never written to persistent server storage; only the text transcript of the conversation is retained.
- AI output is exclusively in English for the duration of any session — no word, phrase, or error correction in any other language.

## Business Logic

The learner's chosen lesson shapes the AI's topic and context, while the AI decides in real time which speech errors are significant enough to correct without breaking the conversational flow.

The learner creates a lesson by filling a template (name, subject, conversation goal, optional vocabulary). This template defines the AI's topic scope and behavioral context for every session under that lesson — it determines what territory the AI stays in and what it should introduce. The AI never drifts outside this boundary during a topic-based session.

During the conversation the AI makes a binary call on each error: significant (invented words, serious structural mistakes that impede communication) vs. ignorable (articles, contractions, minor slips). Only significant errors are addressed, and only in a way that keeps the conversation going — not a formal correction interrupt.

In free conversation sessions, the topic boundary is removed but the error-filtering rule still applies.

## Access Control

Single user; no auth; session transcripts and lessons persisted in application database. No login system. No multi-user separation. This is explicitly a one-person application.

## Non-Goals

- No login or authentication system — this is a single-person app by design; adding auth would add complexity with zero benefit.
- No AI-generated automatic lesson creation — lessons are created manually by the user filling a template.
- No post-session language tests in a different format than conversation — assessment happens through the conversation itself, not quizzes or exercises.
- No end-of-session mistake summary in v1 — deferred to v2 (FR-015).
- No topic suggestions at end of session in v1 — deferred to v2 (FR-016).
- No multi-user access — one person uses this app.
- No native mobile app — web app on mobile browser is sufficient for v1.

## Open Questions

_(none — all questions resolved during shaping)_
