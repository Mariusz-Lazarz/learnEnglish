# Voice Pipeline Baseline Implementation Plan

## Overview

Install the Vercel AI SDK and OpenAI SDK; wire three API routes (Whisper STT, GPT-4o mini streaming LLM, OpenAI TTS proxy); build a minimal browser test page that proves the end-to-end voice loop. Verify the <3s response-start NFR under real VPS + Cloudflare conditions before closing this foundation. Every subsequent slice (S-01 lesson management, S-02 first voice conversation) builds on top of these routes.

## Current State Analysis

No API routes exist — `src/app/api/` is absent. No voice-related packages are installed; only `drizzle-orm`, `postgres`, and Next.js are in `dependencies`. Both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` appear (commented out) in `.env.production.example`, confirming the naming convention. The deploy pipeline (`.github/workflows/deploy.yml`) already SSHs to the VPS and can run commands. nginx is configured with `proxy_buffering off` on `location /` (from `context/foundation/infrastructure.md`), so SSE streaming will work out of the box. PM2 runs with `instances: 1` — no SSE stream fragmentation risk.

## Desired End State

- Three route files exist and TypeScript compiles with no errors: `src/app/api/transcribe/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/tts/route.ts`
- `/pipeline-test` page opens in a browser, records audio with one button, and plays back the AI teacher's spoken response
- Time from button-stop to first TTS audio playing is <3s when tested on the VPS (not just localhost)
- `OPENAI_API_KEY` is present in `/root/learnEnglish/.env.production` on the VPS

### Key Discoveries:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` confirms Route Handlers use standard Web Request/Response APIs — no surprises from this Next.js version
- nginx's `proxy_buffering off` on `location /` already covers all routes — SSE from `/api/chat` will stream correctly without any nginx change
- OpenAI Whisper's `transcriptions.create` requires a `File` object with a filename — a raw `Blob` is not enough; the route must wrap the form-data blob in `new File([blob], 'audio.webm', { type: 'audio/webm' })`
- Vercel AI SDK's `streamText` + `result.toDataStreamResponse()` is wire-compatible with `useChat` from `ai/react` — the test page can use `useChat` for the LLM step without custom SSE parsing
- OpenAI TTS returns a `Response`-like object whose `.body` is a `ReadableStream<Uint8Array>` — it can be passed directly to `new Response(response.body, { headers: { 'Content-Type': 'audio/mpeg' } })`
- The infrastructure doc explicitly states: "build and test on the actual VPS under production conditions, not just localhost, before committing to a provider combination" — VPS verification is a hard gate for this baseline

## What We're NOT Doing

- No lesson-specific system prompt parameterisation — that comes in S-02 (lesson param will be wired when the chat route is extended)
- No automatic voice activity detection — user manually clicks Stop; VAD comes in S-02 if needed
- No conversation persistence — the test page holds messages in memory only; DB writes are S-02's job
- No shadcn/ui components on the test page — raw HTML buttons are sufficient for baseline verification
- No WebSocket or streaming audio from TTS — full TTS audio buffered and played as a blob
- No Deepgram / ElevenLabs — OpenAI-only pipeline for all three steps
- No retry logic on provider failures — fail fast with a structured JSON error

## Implementation Approach

Four sequential phases. Phases 1–3 are local changes verified in `npm run dev`. Phase 4 requires a push to `main` and VPS access to add the API key — it is the hard NFR gate. The three API routes are independent of each other and can be developed in any order within Phase 2, but the test page (Phase 3) depends on all three routes being present.

## Critical Implementation Details

**Whisper requires a `File`, not a `Blob`** — `req.formData().get('audio')` returns a `Blob` with no filename. Whisper's API rejects nameless blobs. Wrap before sending: `new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' })`.

**`streamText` is not async** — `streamText(...)` returns a `StreamTextResult` synchronously; JSON parse errors from `req.json()` must be caught separately before calling it. `toDataStreamResponse()` builds the SSE response from the result; errors during streaming propagate through the SDK's internal error channel, not via a thrown exception.

**TTS model choice** — Use `tts-1` (not `tts-1-hd`) for the latency budget. `tts-1-hd` adds 200–400ms for higher fidelity, which is incompatible with the <3s NFR given the STT + LLM time already consumed.

---

## Phase 1: Package installation and environment

### Overview

Add the three runtime packages required for the voice pipeline. Update the env template so the VPS step in Phase 4 has clear guidance.

### Changes Required:

#### 1. Install runtime packages

**File**: `package.json`

**Intent**: Add Vercel AI SDK, its OpenAI provider adapter, and the raw OpenAI SDK (needed for Whisper and TTS, which are not yet in the Vercel AI SDK stable API).

**Contract**: Run `npm install ai @ai-sdk/openai openai`. This adds three entries to `dependencies`. No scripts need updating.

#### 2. Update environment template

**File**: `.env.production.example`

**Intent**: Make the OPENAI_API_KEY requirement explicit so the Phase 4 VPS step is not a surprise.

**Contract**: Replace the commented-out `# OPENAI_API_KEY=sk-...` line with an uncommented placeholder: `OPENAI_API_KEY=sk-...`. Leave `ANTHROPIC_API_KEY` commented out — it is not used in this pipeline.

### Success Criteria:

#### Automated Verification:

- `npm install` exits 0 with no peer-dep conflicts
- `npm run typecheck` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- `package.json` dependencies include `ai`, `@ai-sdk/openai`, `openai`
- `.env.production.example` shows `OPENAI_API_KEY` as an active (uncommented) line

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Three API routes

### Overview

Create `src/app/api/transcribe/route.ts`, `src/app/api/chat/route.ts`, and `src/app/api/tts/route.ts`. Each route is small and independently testable with `curl`.

### Changes Required:

#### 1. Transcription route

**File**: `src/app/api/transcribe/route.ts`

**Intent**: Accept a multipart audio blob from the browser, forward it to the OpenAI Whisper API with English forced, and return the transcript as JSON.

**Contract**: Exports a `POST` handler. Reads `audio` from `req.formData()` as a `Blob`; wraps it in `new File([blob], 'audio.webm', { type: 'audio/webm' })` before passing to `openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'en' })`. Returns `Response.json({ transcript: string })` on success; returns `Response.json({ error: string }, { status: 500 })` on any thrown error.

The `OpenAI` client is instantiated at module scope: `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`. No singleton guard needed (HTTP client, no connection pool).

#### 2. Chat streaming route

**File**: `src/app/api/chat/route.ts`

**Intent**: Accept a conversation message array and stream the GPT-4o mini response via SSE, using a hardcoded English teacher system prompt. The response format is wire-compatible with Vercel AI SDK's `useChat` hook.

**Contract**: Exports a `POST` handler. Reads `{ messages, systemPrompt }` from `req.json()` — `systemPrompt` is optional; falls back to the default below. Calls `streamText({ model: openai('gpt-4o-mini'), system, messages })` from the Vercel AI SDK and returns `result.toDataStreamResponse()`.

Default system prompt (hardcoded constant in the file):
```
You are an English conversation teacher. Speak in English only — never use another language, not even in error corrections. Ask follow-up questions and keep the conversation going. Correct only major errors: invented words or serious structural mistakes that would confuse a native speaker. Do not correct minor slips, articles, contractions, or informal grammar. Keep each response to 1–2 sentences.
```

`openai` provider imported from `@ai-sdk/openai`; `streamText` from `ai`.

#### 3. TTS proxy route

**File**: `src/app/api/tts/route.ts`

**Intent**: Accept the LLM's text response and return synthesised speech audio bytes so the browser can play them without exposing the OpenAI API key client-side.

**Contract**: Exports a `POST` handler. Reads `{ text: string }` from `req.json()`. Calls `openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: text })` where `openai` is `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`. Returns `new Response(response.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' } })` — `response.body` is the `ReadableStream<Uint8Array>` from the SDK's response. On error returns `Response.json({ error: string }, { status: 500 })`.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` exits 0 with all three route files present
- `npm run lint` exits 0

#### Manual Verification:

- `curl -s -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Hello, are you my teacher?"}]}' | head -5` returns SSE data lines starting with `data:`
- `curl -s -X POST http://localhost:3000/api/tts -H 'Content-Type: application/json' -d '{"text":"Hello! I am your English teacher."}' --output /tmp/test.mp3 && file /tmp/test.mp3` reports `MPEG ADTS, layer III`
- Transcribe route: tested via the test page in Phase 3 (curl multipart audio is awkward to construct; browser test is the right vehicle)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Minimal test page

### Overview

Create `src/app/pipeline-test/page.tsx` — a `'use client'` component that orchestrates the full voice loop: record → transcribe → stream LLM response → play TTS audio. Includes a latency counter so the <3s NFR can be measured visually.

### Changes Required:

#### 1. Pipeline test page

**File**: `src/app/pipeline-test/page.tsx`

**Intent**: Give a browser-based harness to verify all three routes work end-to-end and to measure the voice loop latency (time from recording stop to first audio playback). The page is not part of the product UI — it exists solely for Phase 4 VPS verification and can be deleted after S-02 ships.

**Contract**: `'use client'` directive at top. The component:

- Maintains local state: `recording: boolean`, `transcript: string`, `error: string | null`, `latencyMs: number | null`
- Uses `useChat` from `ai/react` with `api: '/api/chat'` and an `onFinish` callback that calls `playTTS(message.content)`
- `startRecording()`: calls `navigator.mediaDevices.getUserMedia({ audio: true })`, creates `new MediaRecorder(stream, { mimeType: 'audio/webm' })`, starts it; stores chunks in a ref
- `stopRecording()`: stops the MediaRecorder, collects the chunks into `new Blob(chunks, { type: 'audio/webm' })`, records `t0 = Date.now()`, sends `formData` to `POST /api/transcribe`, gets `{ transcript }`, sets transcript state, then calls `useChat.append({ role: 'user', content: transcript })`
- `playTTS(text)`: fetches `POST /api/tts` with `{ text }`, gets response blob via `response.blob()`, creates `URL.createObjectURL(blob)`, plays via `new Audio(url).play()`, sets `latencyMs = Date.now() - t0`
- Renders: a "Record / Stop" toggle button; the transcript text; the conversation message list from `useChat`; the latency display (`Response in X.Xs` or `—`); any error string

The page route `/pipeline-test` must not conflict with any `route.ts` at the same segment — it won't since no `route.ts` exists at `src/app/pipeline-test/`.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0 (confirms page is valid for production)

#### Manual Verification:

- Navigate to `http://localhost:3000/pipeline-test` in Chrome; page loads without console errors
- Click Record, speak a sentence in English, click Stop — transcript appears within ~1s
- LLM response text streams in below; audio plays automatically
- Latency display shows time from stop to audio start — note the value (baseline on localhost)
- Second turn: click Record again; append to conversation; AI acknowledges prior context (multi-turn works)
- Verify browser console shows no uncaught errors

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: VPS deploy and NFR verification

### Overview

Add the OpenAI API key to the VPS environment, push to `main`, let CI deploy, and measure the <3s response-start NFR on real infrastructure. This is the hard gate that closes the baseline.

### Changes Required:

#### 1. Add OPENAI_API_KEY to VPS environment

**File**: `/root/learnEnglish/.env.production` on the VPS (manual step, not a code change)

**Intent**: Make the API key available to the Next.js process at runtime. The existing pattern (`.env.production` on VPS) is the established secret management approach for this project.

**Contract**: SSH to the VPS; append `OPENAI_API_KEY=sk-...` to `/root/learnEnglish/.env.production`. Then `pm2 reload learn-english --update-env` to hot-reload env without a full restart — or let the CI deploy handle the restart on the next push.

#### 2. Push to main

**File**: no file changes (this step is a git push)

**Intent**: Trigger CI deploy so the three new routes and the test page are live on the VPS.

**Contract**: After the Phase 3 commit lands on `main`, the existing CI pipeline (`build-and-deploy` job) will SCP the build and restart PM2. No workflow changes are needed — the three new routes are standard Next.js files that build and deploy automatically.

### Success Criteria:

#### Automated Verification:

- CI pipeline (`npm run lint`, `npm run build`, `npm audit --audit-level=high`) passes on push to `main`
- PM2 restarts successfully — visible in the GitHub Actions "Restart app" step log

#### Manual Verification:

- Open `https://<your-domain>/pipeline-test` in Chrome on the VPS-served app
- Click Record, speak a short sentence, click Stop
- **Measure**: time from Stop click to first audio playback begins — target <3s
- Repeat 3 times; all three runs must be <3s; note the median
- If any run exceeds 3s: check VPS → OpenAI API network latency (`curl -s -o /dev/null -w "%{time_total}\n" -X POST https://api.openai.com/v1/audio/speech ...` from VPS) and identify which step is the bottleneck before closing the baseline

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No test runner is configured. Automated verification relies on TypeScript type-checking and ESLint only.

### Integration Tests:

None in this change. Integration testing of the pipeline (including database transcript persistence) is part of S-02.

### Manual Testing Steps:

1. Phase 2: `curl` the `/api/chat` and `/api/tts` routes on localhost — confirm SSE stream and audio bytes respectively
2. Phase 3: Full voice loop in browser on localhost — confirm transcript, streaming LLM text, audio playback, multi-turn context
3. Phase 4: Full voice loop on VPS — measure 3 consecutive runs; all <3s

## Performance Considerations

The <3s budget breaks down roughly as:
- STT (Whisper): 300–800ms for short utterances
- Network round-trip (client → VPS → OpenAI → VPS): 50–150ms per hop
- LLM first token (GPT-4o mini): 300–500ms; LLM full response (1–2 sentences): 500–1000ms
- TTS (tts-1, nova): 200–500ms

Using `tts-1` instead of `tts-1-hd` and capping LLM responses to 1–2 sentences (enforced via system prompt) keeps the total within budget. If VPS → OpenAI latency is high (>200ms), the budget tightens — log each step's duration in the test page to pinpoint bottlenecks.

## Migration Notes

No database changes. No schema migration required. Env-only change on the VPS.

## References

- Roadmap item F-02: `context/foundation/roadmap.md`
- Infrastructure (nginx SSE config, VPS secrets pattern): `context/foundation/infrastructure.md`
- DB data-access pattern (for S-02 to extend this): `context/changes/db-schema-data-access/plan.md`
- Next.js Route Handler docs: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Package installation and environment

#### Automated

- [x] 1.1 npm install exits 0 with no peer-dep conflicts — 06cba2c
- [x] 1.2 npm run typecheck exits 0 — 06cba2c
- [x] 1.3 npm run lint exits 0 — 06cba2c

#### Manual

- [x] 1.4 package.json dependencies include ai, @ai-sdk/openai, openai — 06cba2c
- [x] 1.5 .env.production.example shows OPENAI_API_KEY as an active (uncommented) line — 06cba2c

### Phase 2: Three API routes

#### Automated

- [x] 2.1 npm run typecheck exits 0 with all three route files present — 06cba2c
- [x] 2.2 npm run lint exits 0 — 06cba2c

#### Manual

- [x] 2.3 curl /api/chat returns SSE data lines — 06cba2c
- [x] 2.4 curl /api/tts returns valid MPEG audio bytes — 06cba2c
- [x] 2.5 /api/transcribe tested via test page in Phase 3 — 06cba2c

### Phase 3: Minimal test page

#### Automated

- [x] 3.1 npm run typecheck exits 0 — 06cba2c
- [x] 3.2 npm run lint exits 0 — 06cba2c
- [x] 3.3 npm run build exits 0 — 06cba2c

#### Manual

- [x] 3.4 /pipeline-test loads in Chrome with no console errors — 06cba2c
- [x] 3.5 Full voice loop works: record → transcript → streaming LLM text → audio plays — 06cba2c
- [x] 3.6 Latency display shows time from stop to audio start — 06cba2c
- [x] 3.7 Second turn demonstrates multi-turn context (AI acknowledges prior message) — 06cba2c

### Phase 4: VPS deploy and NFR verification

#### Automated

- [x] 4.1 CI pipeline passes on push to main (lint, build, audit, deploy steps all exit 0)

#### Manual

- [x] 4.2 OPENAI_API_KEY present in /root/learnEnglish/.env.production on VPS
- [x] 4.3 /pipeline-test accessible at production URL
- [x] 4.4 Three consecutive voice loops on VPS all complete in <3s (time from Stop to first audio)
