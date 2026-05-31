<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: DB Schema & Data-Access Layer

- **Plan**: context/changes/db-schema-data-access/plan.md
- **Scope**: All Phases (1, 2, 3)
- **Date**: 2026-05-31
- **Verdict**: REJECTED
- **Findings**: 1 critical · 6 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — node_modules/ copied verbatim to VPS on every deploy

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/deploy.yml:34
- **Detail**: The SCP source list includes `node_modules/`, which means the exact node_modules tree from the CI runner is shipped to production verbatim. This bypasses lock-file integrity on the VPS (production never runs `npm ci` from a clean state), bloats every deploy transfer, and means any supply-chain issue in a single CI run reaches production. Note: pre-existing in deploy.yml — Phase 3 did not introduce it, but the file was edited and the opportunity to fix it was not taken.
- **Fix A ⭐ Recommended**: Remove `node_modules/` from source; add SSH step running `npm ci --omit=dev` on the VPS after the copy.
  - Strength: VPS installs from package-lock.json in a clean state each deploy. Dramatically smaller SCP transfer.
  - Tradeoff: Adds ~30–60s install time per deploy. VPS needs Node/npm (already available via NVM).
  - Confidence: HIGH — deploy.yml already has NVM wiring in the migrate SSH step.
  - Blind spot: None significant.
- **Fix B**: Keep `node_modules/` in source but add a post-copy `npm ci --omit=dev` on the VPS to reconcile.
  - Strength: Minimal structural change.
  - Tradeoff: Does not eliminate the integrity gap during the window before reconciliation runs.
  - Confidence: LOW — does not actually close the supply-chain risk window.
  - Blind spot: A compromised module is already on the VPS before reconcile runs.
- **Decision**: PENDING

---

### F2 — Lint now exits 1: unused eslint-disable directive in client.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/db/client.ts:6
- **Detail**: `// eslint-disable-next-line no-var` was added to suppress the `var` in `declare global { var _pgClient: ... }`. The `no-var` rule is not enabled in this project's ESLint config, so the directive is unused. Next.js lint reports "Unused eslint-disable directive" and exits 1. Plan progress marks 2.2 `npm run lint exits 0` — this is now false.
- **Fix**: Remove the `// eslint-disable-next-line no-var` comment on line 6 of `src/db/client.ts`.
- **Decision**: PENDING

---

### F3 — dotenv wires .env.production into drizzle.config.ts; file ships to VPS

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: drizzle.config.ts:1,4 / .github/workflows/deploy.yml:34
- **Detail**: Plan specified a minimal drizzle.config.ts with no env loading. The implementation added `import { config } from 'dotenv'` and `config({ path: '.env.production' })`, then added `drizzle.config.ts` to the SCP source list. The hard-coded `.env.production` path means `npm run db:generate` or `db:migrate` fails on any machine without that exact file.
- **Fix A ⭐ Recommended**: Document the dotenv approach as a plan addendum and guard the call: `if (!process.env.DATABASE_URL) config({ path: '.env.production' })`. Remove `drizzle.config.ts` from the SCP source list (DATABASE_URL is already injected via GitHub secret in the migrate step).
  - Strength: Preserves implementation choice; fixes machine portability gap; removes unnecessary file from production.
  - Tradeoff: Minor — a few-line edit.
  - Confidence: HIGH — DATABASE_URL is already available via GitHub secret in the migrate SSH step.
  - Blind spot: None significant.
- **Fix B**: Remove the dotenv wiring entirely; rely on GitHub secret injection for CI and a real env var for local use.
  - Strength: Cleaner — no dotenv dependency.
  - Tradeoff: Developers must set DATABASE_URL in their shell or a `.env` file for local db:generate to work.
  - Confidence: MEDIUM — depends on discipline to set the env var locally.
  - Blind spot: `.env.production` may be needed for other local tooling.
- **Decision**: PENDING

---

### F4 — Migration and app restart are separate SSH steps — partial failure risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/deploy.yml:37–67
- **Detail**: "Run DB migrations" and "Restart app" are two distinct SSH steps. If migrations succeed but restart fails, the VPS schema is ahead of the running application code with no automated recovery. Additionally, drizzle-kit is a devDependency — if `node_modules/` is removed from the SCP source (per F1 fix), `npx drizzle-kit migrate` on the VPS will fail unless drizzle-kit is globally available or promoted to `dependencies`.
- **Fix A ⭐ Recommended**: Combine migrate + restart into a single SSH script so both operations are atomic within one step.
  - Strength: Single failure surface; removes duplicated NVM sourcing between the two steps.
  - Tradeoff: Slightly longer script.
  - Confidence: HIGH — natural extension of the existing restart SSH script.
  - Blind spot: Still no rollback if migration itself has a bug — but forward-only migrations are an explicit design choice.
- **Fix B**: Keep separate steps; verify `if: success()` condition on restart.
  - Strength: Minimal change.
  - Tradeoff: NVM sourcing duplication remains; two SSH round-trips per deploy.
  - Confidence: MEDIUM — relies on GitHub Actions default step-failure behavior.
  - Blind spot: Default behavior should be verified against current workflow settings.
- **Decision**: PENDING

---

### F5 — Application runs as root on VPS

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/deploy.yml:36 (cd /root/learnEnglish)
- **Detail**: The deploy script operates in `/root/learnEnglish` and VPS_USER connects as root. Any RCE vulnerability in Next.js, a dependency, or user-supplied input gives immediate root access to the host. Pre-existing, but Phase 3 established the deployment pattern.
- **Fix**: Create a dedicated non-root system user (e.g. `learnEnglish`), deploy to `/home/learnEnglish/`, update VPS_USER secret. VPS-level config change — no code changes needed.
- **Decision**: PENDING

---

### F6 — Unbounded table scans: getAllLessons and getAllSessions have no limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/db/queries/lessons.ts:9 / src/db/queries/sessions.ts:23
- **Detail**: Both `getAllLessons()` and `getAllSessions()` fetch all rows with no `.limit()`. `getAllSessions()` does a LEFT JOIN against lessons on every row. S-01 and S-02 will import these functions directly and inherit the unbounded behavior.
- **Fix**: Add a sensible default limit (e.g. `.limit(100)`) or expose `(limit?: number, offset?: number)` parameters to both functions.
- **Decision**: PENDING

---

### F7 — Non-null assertion on DATABASE_URL gives no diagnostic on misconfiguration

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/db/client.ts:10
- **Detail**: `postgres(process.env.DATABASE_URL!)` — if DATABASE_URL is absent, the postgres driver throws an obscure internal error instead of a clear diagnostic. This is a system boundary where input validation is warranted.
- **Fix**: Replace with an explicit guard: `const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL environment variable is not set'); const client = globalThis._pgClient ?? postgres(url);`
- **Decision**: PENDING

---

### F8 — schema.ts uses $defaultFn(() => randomUUID()) instead of .defaultRandom()

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/db/schema.ts (id columns on all three tables)
- **Detail**: Plan specified `.defaultRandom()` (Drizzle's built-in UUID helper). The implementation uses `.$defaultFn(() => randomUUID())` from Node crypto. `$defaultFn` is a JS-side default while `.defaultRandom()` generates a SQL-level DEFAULT. The migration SQL confirms the SQL DEFAULT is absent — direct inserts via psql bypass the default. For this app that's not a concern, but it's a plan deviation.
- **Fix**: Accept as-is or switch to `.defaultRandom()` if SQL-level defaults matter. No behavior change for application inserts.
- **Decision**: PENDING

---

### F9 — deploy.yml migrate step uses GitHub secret injection, not source .env.production

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/deploy.yml:39–47
- **Detail**: Plan specified `set -a && source .env.production && set +a` to provide DATABASE_URL at migrate time. The implementation uses `env: DATABASE_URL: ${{ secrets.DATABASE_URL }}` + `envs: DATABASE_URL` instead — actually a better approach, but a deviation. Requires DATABASE_URL to be added as a GitHub Actions secret.
- **Fix**: Document this deviation in the plan as an addendum. Verify DATABASE_URL is set in GitHub Actions secrets.
- **Decision**: PENDING

---

### F10 — onDelete: set null silently loses lesson association on historical sessions

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/db/schema.ts:25
- **Detail**: `sessions.lessonId` is a nullable FK with `onDelete: 'set null'`. Deleting a lesson nullifies `lesson_id` on all associated sessions with no record of what lesson the session belonged to. For a learning app where session history is meaningful, this is quiet data loss from a routine management action. The plan specified this behavior explicitly — not a drift, but worth flagging before S-01 ships lesson deletion.
- **Fix**: Accept current design and document the implication, OR add a `lessonName` snapshot column to sessions at insert time so the association is preserved even after the lesson is deleted.
- **Decision**: PENDING
