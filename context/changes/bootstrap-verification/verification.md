---
bootstrapped_at: 2026-05-30T10:18:35Z
starter_id: next
starter_name: Next.js
project_name: learn-english
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: next
package_manager: npm
project_name: learn-english
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack**

LearnEnglish is a solo-built voice AI conversation app for a single user. Next.js deployed on a self-hosted VPS (`next start` behind nginx + PM2) runs as a persistent Node.js process — no serverless timeout constraints, so LLM streaming responses stay open as long as needed to meet the 3-second voice response NFR. The Vercel AI SDK handles the streaming LLM pipeline with SSE out of the box. shadcn/ui provides the component library for lesson management and session UI — typed, accessible, zero configuration overhead for a solo build. PostgreSQL runs in a Docker container on the same VPS, storing lessons and session transcripts; no managed database service needed at single-user scale. GitHub Actions handles CI with auto-deploy on merge to main via SSH deploy script.

## Pre-scaffold verification

| Signal      | Value                                          | Severity | Notes                            |
| ----------- | ---------------------------------------------- | -------- | -------------------------------- |
| npm package | create-next-app v16.2.6 published 2026-05-30  | fresh    | resolved from cmd_template       |
| GitHub repo | not run                                        | n/a      | docs_url is nextjs.org/docs (not a GitHub URL) |

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
**Strategy**: subdir-then-move (scaffolded into temp dir `bootstrap-scaffold/`, then moved files up; `{name}=.bootstrap-scaffold` rejected by create-next-app's npm naming check — used `bootstrap-scaffold` instead)
**Exit code**: 0
**Files moved**: 16 (`.git`, `.gitignore`, `.next`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `node_modules`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `public`, `src`, `tsconfig.json`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no pre-existing .gitignore in cwd)
**bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/0/2/0

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

| Package  | Version   | Advisory                | CVSS | Direct? | Description                                            | Fix                          |
| -------- | --------- | ----------------------- | ---- | ------- | ------------------------------------------------------ | ---------------------------- |
| postcss  | < 8.5.10  | GHSA-qx2v-qp2m-jg93    | 6.1  | No      | XSS via Unescaped `</style>` in CSS Stringify Output   | Bundled inside `next`; fix requires `next` upgrade to v9.3.3 (semver major) |
| next     | 9.3.4-canary.0 – 16.3.0-canary.5 | via postcss above | —  | Yes     | Affected via transitive `postcss`                      | `next@9.3.3` (major downgrade — not recommended) |

Note: the `postcss` vulnerability lives in a version bundled inside `next`'s own `node_modules`, not the top-level `postcss` devDependency. The suggested fix (`next@9.3.3`) is a major version downgrade and should be deferred until Next.js ships a patch release that resolves the bundled dependency.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | verified               |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | self-host              |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | false                  |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | true                   |
| has_background_jobs     | false                  |

These hint values are carried forward into the audit trail for the future M1L4 skill (Memory Architecture / AGENTS.md + CLAUDE.md generation). No automated action was taken on any of them in v1.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none created this run — clean scaffold).
- The 2 MODERATE audit findings are in a `postcss` version bundled inside `next`. Monitor Next.js releases for a patch that resolves the bundled dependency; the suggested major downgrade is not recommended.
- `npm run dev` to confirm the scaffold runs locally.
