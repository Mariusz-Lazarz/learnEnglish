# Voice Pipeline Baseline — Plan Brief

> Full plan: `context/changes/voice-pipeline-baseline/plan.md`

## What & Why

Wire the STT → LLM → TTS pipeline that every voice slice depends on. Without a verified, latency-tested pipeline, S-02 (the north star slice) has no foundation to build on. The pipeline must prove the <3s response-start NFR on real infrastructure — not just localhost — before this foundation is closed.

## Starting Point

No API routes exist; `src/app/api/` is absent. The Vercel AI SDK and OpenAI SDK are not installed. nginx is already configured with `proxy_buffering off` on the entire `location /` block, so SSE streaming will work without any infrastructure change.

## Desired End State

Three typed API routes are live on the VPS: `/api/transcribe` (Whisper STT), `/api/chat` (GPT-4o mini streaming), `/api/tts` (OpenAI TTS proxy). A `/pipeline-test` page lets the user record audio, watch the transcript appear, read the streaming LLM response, and hear the AI teacher's voice — with a latency counter confirming the full round-trip completes in under 3 seconds.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| STT provider | OpenAI Whisper API | High accuracy on non-native English; same API key as LLM and TTS | Plan |
| LLM provider | OpenAI GPT-4o mini | Fast first token (~300–500ms), cheap, Vercel AI SDK first-class support | Plan |
| TTS provider | OpenAI TTS API | Natural voice, simple REST call, same API key; `tts-1` model for latency | Plan |
| Pipeline shape | 3 separate routes | Each independently testable; `/api/chat` SSE + `/api/tts` proxy keeps separation clean | Plan |
| Audio capture | MediaRecorder, manual stop | Simplest deterministic turn boundary; VAD deferred to S-02 | Plan |
| Conversation history | Multi-turn from start | `/api/chat` accepts `CoreMessage[]` — matches the contract S-02 will use | Plan |
| System prompt | Hardcoded default in route | English teacher persona locked in baseline; lesson-specific prompt parameterised in S-02 | Plan |
| Error handling | Fail fast, structured JSON | No retry logic in baseline; retries belong in S-02 when full UI exists | Plan |
| Secrets | Add to `.env.production` on VPS | Consistent with established DATABASE_URL pattern | Plan |
| NFR gate | Verified on VPS, not localhost | Infrastructure doc explicitly requires real-infrastructure measurement for provider commitment | Plan |

## Scope

**In scope:**
- Install `ai`, `@ai-sdk/openai`, `openai` packages
- `src/app/api/transcribe/route.ts` — Whisper STT
- `src/app/api/chat/route.ts` — GPT-4o mini streaming (multi-turn, hardcoded teacher prompt)
- `src/app/api/tts/route.ts` — OpenAI TTS proxy (`tts-1`, voice `nova`)
- `src/app/pipeline-test/page.tsx` — minimal test harness with latency counter
- VPS: add `OPENAI_API_KEY` to `.env.production`; verify <3s NFR

**Out of scope:**
- Lesson-specific system prompt (S-02)
- Auto voice activity detection / VAD (S-02)
- Conversation transcript persistence to DB (S-02)
- shadcn/ui components on the test page
- Streaming TTS audio (full buffer approach is sufficient for baseline)
- Any provider other than OpenAI

## Architecture / Approach

```
Browser (pipeline-test page)
  │  MediaRecorder → audio blob
  ▼
POST /api/transcribe   ── Whisper API ──► { transcript }
  │
  ▼  (useChat.append)
POST /api/chat         ── GPT-4o mini ──► SSE stream ──► text response
  │
  ▼  (onFinish callback)
POST /api/tts          ── tts-1 API ──► audio/mpeg stream ──► Audio.play()
```

All three routes run on the VPS persistent Node.js process; API keys stay server-side. The `useChat` hook from `ai/react` manages the LLM SSE stream on the client.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Package install | `ai`, `@ai-sdk/openai`, `openai` in deps; env template updated | Peer-dep conflicts (unlikely with current versions) |
| 2. API routes | Three working route handlers, curl-verified | Whisper blob→File wrapping; TTS stream passthrough |
| 3. Test page | Full browser voice loop with latency counter | MediaRecorder mimeType compatibility (Chrome required for `audio/webm`) |
| 4. VPS deploy & NFR | <3s measured on real infrastructure, baseline closed | VPS→OpenAI network latency may exceed budget; diagnose per-step if so |

**Prerequisites:** F-01 (DB schema) is done through Phase 2. No DB reads/writes in this pipeline — no ordering dependency on F-01 for the routes themselves, but S-02 (which extends these routes) requires both F-01 and F-02 complete.

**Estimated effort:** ~2 focused sessions across 4 phases; Phase 4 requires VPS SSH access and an OpenAI API key with Whisper + TTS enabled.

## Open Risks & Assumptions

- VPS → OpenAI API network latency is assumed to be ≤150ms; if the VPS datacenter is geographically far from OpenAI's endpoints, the <3s NFR may require switching to a faster TTS model or streaming TTS (sentence-by-sentence) in a follow-up
- `audio/webm` MediaRecorder output is Chrome/Edge-native; Safari uses `audio/mp4` — the test page's mimeType handling may need a fallback for Safari, but Chrome is the primary test browser for baseline
- GPT-4o mini's 1–2 sentence responses are enforced by the system prompt, not a hard API limit — if the model ignores the constraint, TTS audio will be longer and latency may exceed 3s

## Success Criteria (Summary)

- Three API routes pass TypeScript type-check and ESLint with no errors
- Full voice loop (record → transcribe → LLM → TTS → audio) completes in the test page without errors
- Three consecutive voice loops on the VPS all complete in <3s from audio-stop to first audio byte playing
