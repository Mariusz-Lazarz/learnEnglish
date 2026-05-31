# DB Schema & Data-Access Layer Implementation Plan

## Overview

Install Drizzle ORM with a postgres.js driver, define the `lessons`, `sessions`, and `transcripts` PostgreSQL tables in TypeScript, generate and apply the initial SQL migration, write a typed data-access layer (DAL) under `src/db/queries/`, and wire automated migration into the GitHub Actions deploy pipeline. This is Foundation F-01; every subsequent slice imports from `@/db`.

## Current State Analysis

No database tooling is present. The project has zero DB-related packages, no `src/app/api/` routes, and no migration infrastructure. The sole indicator is a `DATABASE_URL` env var in `.env.production.example` pointing to a local PostgreSQL instance. The `@/*` → `src/*` path alias is wired in `tsconfig.json`. CI copies `node_modules/` to the VPS via SCP; the VPS has PM2 running `next start` behind nginx (persistent Node.js process, no serverless timeout).

## Desired End State

After this change:
- `npx drizzle-kit generate` is a no-op (no pending schema changes)
- `npx drizzle-kit migrate` is a no-op (all migrations already applied to the VPS database)
- The three tables exist in PostgreSQL with the exact column shapes defined in `src/db/schema.ts`
- Any component or API route under `src/` can `import { db } from '@/db'` and call typed query functions to read/write lessons, sessions, and transcripts with no `any` types
- The GitHub Actions deploy pipeline automatically migrates the VPS database before restarting PM2 on every push to `main`

### Key Discoveries:

- The `DATABASE_URL` key is already defined in `.env.production.example` — the secret naming convention is settled
- The deploy pipeline already SSHs to the VPS and can run arbitrary commands before the PM2 restart; adding a migrate step requires no new secrets
- `node_modules/` is copied verbatim to the VPS via SCP, so devDependencies (including `drizzle-kit`) are available on the VPS at deploy time
- Next.js App Router dev-mode hot reload can exhaust postgres.js connection pools if the client is not guarded with a global singleton (see Critical Implementation Details)

## What We're NOT Doing

- No API routes — those belong to S-01 (lesson CRUD) and S-02 (voice session)
- No shadcn/ui, Vercel AI SDK, or voice pipeline libraries — those are F-02
- No seed data or example lessons
- No connection-string validation at app startup — Postgres availability is an infrastructure concern
- No migration rollback strategy — forward-only migrations for v1
- No `drizzle-kit push` usage in any environment — only `drizzle-kit migrate` with SQL files

## Implementation Approach

Three-phase sequential build: first establish the schema + migration tooling (Phase 1), then the typed query layer (Phase 2), then wire both into CI/CD (Phase 3). Phases 1 and 2 are local changes; Phase 3 touches the live deploy pipeline and is the only step that modifies CI artifacts.

## Critical Implementation Details

**postgres.js global singleton** — In Next.js `next dev`, hot reload re-evaluates module files on every change. Each evaluation creates a new postgres.js connection pool unless the pool is cached. Guard by storing the `postgres()` client on `globalThis._pgClient` and reusing it on re-evaluation. Without this, the dev session gradually exhausts Postgres `max_connections`. This applies only in development; production has no hot reload.

**`drizzle-kit migrate` vs `drizzle-kit push`** — `push` directly modifies the database schema without writing migration files, destroying the audit trail. Only `migrate` is used in this project. The `db:push` script is intentionally absent from `package.json`.

---

## Phase 1: Install, schema, and initial migration

### Overview

Add Drizzle ORM + postgres.js, define all three tables in TypeScript, configure drizzle-kit, and generate the initial SQL migration file.

### Changes Required:

#### 1. Install packages

**File**: `package.json`

**Intent**: Add runtime DB dependencies and drizzle-kit as a devDependency.

**Contract**: Run `npm install drizzle-orm postgres` and `npm install --save-dev drizzle-kit`. Add three scripts:
- `"db:generate": "drizzle-kit generate"`
- `"db:migrate": "drizzle-kit migrate"`
- `"db:studio": "drizzle-kit studio"`

#### 2. Drizzle configuration

**File**: `drizzle.config.ts` (repo root, sibling of `next.config.ts`)

**Intent**: Tell drizzle-kit where the schema lives, where to write migration files, and which DB URL to use.

**Contract**:
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

#### 3. Drizzle schema

**File**: `src/db/schema.ts`

**Intent**: Define the three tables in TypeScript so Drizzle can generate migration SQL and infer TypeScript types for all queries.

**Contract**: Export three `pgTable` definitions and a `Message` type:

- `lessons`: `id` (UUID PK, `defaultRandom()`), `name` (text, not null), `subject` (text, not null), `conversationGoal` → column `conversation_goal` (text, not null), `vocabulary` (text, nullable), `createdAt`/`updatedAt` (timestamptz, not null, `defaultNow()`)
- `sessions`: `id` (UUID PK, `defaultRandom()`), `lessonId` → `lesson_id` (UUID, nullable FK → `lessons.id` ON DELETE SET NULL), `startedAt` → `started_at` (timestamptz, not null, `defaultNow()`), `endedAt` → `ended_at` (timestamptz, nullable)
- `transcripts`: `id` (UUID PK, `defaultRandom()`), `sessionId` → `session_id` (UUID, not null, FK → `sessions.id` ON DELETE CASCADE), `messages` (jsonb, not null, default `sql\`'[]'\``), `createdAt`/`updatedAt` (timestamptz, not null, `defaultNow()`) + `uniqueIndex` on `session_id`
- `Message` type: `{ role: 'user' | 'assistant'; content: string; timestamp: string }`. Apply `.$type<Message[]>()` on the `messages` column for concrete TypeScript typing of the JSONB field.

#### 4. DB client (singleton)

**File**: `src/db/client.ts`

**Intent**: Create and export a single Drizzle instance backed by a postgres.js connection pool that survives Next.js hot reloads in dev.

**Contract**:
```ts
declare global { var _pgClient: ReturnType<typeof postgres> | undefined; }
const client = globalThis._pgClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== 'production') globalThis._pgClient = client;
export const db = drizzle(client, { schema });
```

#### 5. Generate initial migration

**Action** (not a file edit): Run `npm run db:generate` to produce `db/migrations/0000_*.sql`.

### Success Criteria:

#### Automated Verification:

- All packages install without peer-dep conflicts: `npm install`
- TypeScript compiles: `npm run typecheck` exits 0
- Drizzle generates a migration file: `npm run db:generate` produces `db/migrations/0000_*.sql`
- Generated SQL contains 3 `CREATE TABLE` statements: `grep -c 'CREATE TABLE' db/migrations/0000_*.sql` returns `3`

#### Manual Verification:

- Open the generated SQL file and confirm all columns match the schema design (UUIDs, correct NOT NULL constraints, FK references, UNIQUE on `transcripts.session_id`)
- Run `npm run db:migrate` against the VPS database; confirm it exits 0 and reports the migration as applied
- `psql $DATABASE_URL -c "\dt"` shows `lessons`, `sessions`, `transcripts`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Typed data-access layer

### Overview

Write typed query functions for lessons and sessions/transcripts, then export a clean barrel from `src/db/index.ts` that all downstream slices import from.

### Changes Required:

#### 1. Lessons query module

**File**: `src/db/queries/lessons.ts`

**Intent**: Provide the full CRUD surface for the `lessons` table. These are the only functions S-01 needs to implement lesson management.

**Contract**: Export five typed functions (Drizzle infers return types from the schema):
- `getAllLessons(): Promise<Lesson[]>` — all rows, `ORDER BY created_at DESC`
- `getLessonById(id: string): Promise<Lesson | undefined>`
- `createLesson(data: NewLesson): Promise<Lesson>` — `NewLesson` is `typeof lessons.$inferInsert` (id and timestamps omitted)
- `updateLesson(id: string, data: Partial<NewLesson>): Promise<Lesson | undefined>` — also sets `updated_at = now()`
- `deleteLesson(id: string): Promise<void>`

#### 2. Sessions query module

**File**: `src/db/queries/sessions.ts`

**Intent**: Provide session lifecycle and transcript persistence functions. These are what S-02 (voice session start/end) and S-03 (session library + resume) import.

**Contract**: Export seven typed functions:
- `getAllSessions(): Promise<SessionWithLesson[]>` — LEFT JOIN `lessons` to get `lessonName` (null for free-conversation sessions), `ORDER BY started_at DESC`
- `getSessionById(id: string): Promise<SessionWithLesson | undefined>`
- `createSession(lessonId?: string): Promise<Session>` — absent `lessonId` = free conversation
- `endSession(id: string): Promise<void>` — sets `ended_at = now()`
- `deleteSession(id: string): Promise<void>` — cascade deletes the transcript row via FK
- `saveTranscript(sessionId: string, messages: Message[]): Promise<void>` — upsert into `transcripts` (insert; on conflict on `session_id`, update `messages` and `updated_at`)
- `getTranscriptMessages(sessionId: string): Promise<Message[]>` — returns `[]` if no transcript row exists

`SessionWithLesson` extends the inferred `Session` type with `lessonName: string | null`.

#### 3. Barrel export

**File**: `src/db/index.ts`

**Intent**: Single import point for all downstream slices — `import { db, createLesson, getAllSessions } from '@/db'` should resolve correctly.

**Contract**: Re-export `db` from `./client`; all functions from `./queries/lessons`; all functions from `./queries/sessions`; and the `Message` type from `./schema`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles with no errors: `npm run typecheck`
- ESLint passes: `npm run lint`
- No `any` type in the DAL: `grep -r ': any' src/db/queries/` returns empty

#### Manual Verification:

- In a temporary test script (`test-db.ts` at repo root, deleted after), import from `@/db`; run with `npx tsx test-db.ts` against the VPS database
- Lessons round-trip: `createLesson` → `getLessonById` → `deleteLesson` all succeed with correct TypeScript types
- Sessions round-trip: `createSession` → `endSession` → `saveTranscript` → `getTranscriptMessages` all succeed
- Free-conversation session shows `lessonName: null` in the `SessionWithLesson` result

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wire migration into the deploy pipeline

### Overview

Add the migration files to the SCP transfer list and insert an SSH step that runs `drizzle-kit migrate` on the VPS before PM2 restarts.

### Changes Required:

#### 1. SCP source list

**File**: `.github/workflows/deploy.yml`

**Intent**: Ensure `db/migrations/` is transferred to the VPS so `drizzle-kit migrate` can read pending migration files on deploy.

**Contract**: In the `source:` field of the `appleboy/scp-action` step, append `db/`:
```
source: ".next/,public/,package.json,package-lock.json,ecosystem.config.js,node_modules/,db/"
```

#### 2. Migrate SSH step

**File**: `.github/workflows/deploy.yml`

**Intent**: Apply pending Drizzle migrations to the VPS database before the app restarts on new code, so schema and code are always in sync.

**Contract**: Insert a new step between "Copy build to VPS" and "Restart app", conditioned on `main` push:
```yaml
- name: Run DB migrations
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.VPS_HOST }}
    username: ${{ secrets.VPS_USER }}
    key: ${{ secrets.VPS_SSH_KEY }}
    port: ${{ secrets.VPS_PORT }}
    command_timeout: 2m
    script: |
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
      cd /root/learnEnglish
      set -a && source .env.production && set +a
      npx drizzle-kit migrate
```

`source .env.production` provides `DATABASE_URL` to drizzle-kit; this file is already on the VPS (it's how `next start` runs in production).

### Success Criteria:

#### Automated Verification:

- CI pipeline (lint + build + audit + migrate steps) passes on push to `main` — observable in GitHub Actions tab
- "Run DB migrations" step exits 0

#### Manual Verification:

- After the first push with these changes, SSH to VPS and run `psql $DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at"` — confirm the initial migration record appears
- `psql $DATABASE_URL -c "\dt"` shows `lessons`, `sessions`, `transcripts`
- Running `npx drizzle-kit migrate` manually on VPS reports "No migrations to run" (confirms idempotency)

---

## Testing Strategy

### Unit Tests:

No test runner is configured. Automated verification relies on TypeScript type-checking and ESLint only for this change.

### Integration Tests:

None in this change. DAL integration testing is part of the feature slices that consume it (S-01, S-02).

### Manual Testing Steps:

1. Run `npm run db:generate` — inspect the generated SQL file
2. Run `npm run db:migrate` — confirm tables created on VPS
3. Run temporary round-trip test script (lessons and sessions)
4. Push to `main` — watch the "Run DB migrations" CI step in GitHub Actions
5. SSH to VPS — confirm tables and migration history record

## Migration Notes

- The initial migration is forward-only. Rolling back requires dropping the three tables manually.
- All future schema changes: edit `src/db/schema.ts` → `npm run db:generate` → commit the new SQL file → push to `main` (automatic migration on deploy).
- The `drizzle.__drizzle_migrations` tracking table is created automatically by drizzle-kit; do not edit it manually.

## References

- Roadmap item F-01: `context/foundation/roadmap.md`
- Infrastructure decisions: `context/foundation/infrastructure.md`
- Deploy pipeline: `.github/workflows/deploy.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install, schema, and initial migration

#### Automated

- [x] 1.1 npm install succeeds with no peer-dep conflicts — 9e71939
- [x] 1.2 npm run typecheck exits 0 — 9e71939
- [x] 1.3 npm run db:generate produces db/migrations/0000_*.sql — 9e71939
- [x] 1.4 Generated SQL contains 3 CREATE TABLE statements — 9e71939

#### Manual

- [x] 1.5 Generated SQL matches schema design (columns, types, FKs, UNIQUE on transcripts.session_id) — 9e71939
- [x] 1.6 npm run db:migrate exits 0 against VPS database; \dt confirms 3 tables — 9e71939

### Phase 2: Typed data-access layer

#### Automated

- [x] 2.1 npm run typecheck exits 0
- [x] 2.2 npm run lint exits 0
- [x] 2.3 No `any` type in src/db/queries/ (grep check)

#### Manual

- [x] 2.4 Lessons round-trip via test script (create, read, delete)
- [x] 2.5 Sessions/transcripts round-trip via test script (createSession, saveTranscript, getTranscriptMessages)
- [x] 2.6 Free-conversation session shows lessonName: null in SessionWithLesson

### Phase 3: Wire migration into the deploy pipeline

#### Automated

- [ ] 3.1 CI pipeline passes on push to main (all steps exit 0, including Run DB migrations)

#### Manual

- [ ] 3.2 Migration history row visible in drizzle.__drizzle_migrations on VPS post-deploy
- [ ] 3.3 Running drizzle-kit migrate manually on VPS reports "No migrations to run"
