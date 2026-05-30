---
project: learn-english
researched_at: 2026-05-30
recommended_platform: Own VPS (self-hosted)
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: JavaScript / TypeScript
  framework: Next.js App Router
  runtime: Node.js (persistent, next start)
  database: PostgreSQL (existing, external)
---

## Recommendation

**Deploy on your own VPS.**

You already own the VPS, the domain (Cloudflare-managed), and a PostgreSQL instance — the extra monthly cost is $0. The stack requires a persistent Node.js process for SSE streaming, which a self-hosted VPS supports natively with `next start` behind nginx + PM2. The one-time setup burden (nginx SSE config, PM2, GitHub Actions SSH deploy) is real but finite, and most of the infrastructure (VPS, Certbot, Cloudflare DNS) is likely already partially in place.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable API | MCP | Score | Est. monthly cost |
|---|---|---|---|---|---|---|---|
| **Own VPS** | Partial | Fail | Partial | Partial | Fail | 3/10 | $0 extra |
| **Fly.io** | Pass | Pass | Pass | Pass | Partial¹ | 9/10 | ~$4–5 |
| **Railway** | Partial | Pass | Pass | Pass | Partial² | 8/10 | $5 |
| **Render** | Partial | Pass | Pass | Pass | Pass³ | 9/10 | $7 |
| ~~Vercel~~ | — | ❌ | — | — | — | *dropped* | — |
| ~~Cloudflare Workers~~ | — | ❌ | — | — | — | *dropped* | — |
| ~~Netlify~~ | — | ❌ | — | — | — | *dropped* | — |

¹ `fly mcp server` is experimental as of 2026-05-30  
² Railway MCP is work-in-progress / preview as of 2026-05-30  
³ Render MCP at mcp.render.com is GA (launched August 2025)

**Hard filter applied:** Vercel, Cloudflare Workers, and Netlify dropped — none support persistent Node.js processes (`next start`), which is required for SSE streaming without serverless timeout constraints.

**Decision driver:** $0 extra cost for a platform already in your possession, plus existing Postgres and Cloudflare domain, makes the agent-friendliness trade-off acceptable for a single-user MVP.

### Shortlisted Platforms

#### 1. Own VPS (Recommended)

Already paid for. Supports persistent `next start` process natively. nginx + PM2 is a well-documented, stable pattern for Next.js self-hosting. GitHub Actions SSH deploy is a standard, reusable workflow. The only costs are one-time setup time and ongoing manual security patching. At 1–2 users, there is no scaling concern.

#### 2. Fly.io

Best managed alternative. True persistent micro-VMs (not serverless), SSE and WebSocket support are first-class, CLI (`flyctl`) is fully scriptable, docs are on GitHub as markdown with `llms.txt`. At ~$4–5/month using your existing external Postgres, it removes all ops burden. The experimental MCP server exists but is unstable. `output: "standalone"` is required in `next.config.ts`.

#### 3. Railway

$5/month Hobby plan covers the app at very low traffic. Persistent processes, co-located Postgres available (not needed here). 15-minute SSE connection limit is documented but not a real constraint for per-turn LLM responses. Rollback is dashboard-only (no CLI command). MCP server is in preview. Railway's own production frontend migrated off Next.js in 2025 citing a middleware CVE — self-hosted Next.js requires active patch discipline regardless of platform.

## Anti-Bias Cross-Check: Own VPS

### Devil's Advocate — Weaknesses

1. **nginx SSE buffering is a silent failure mode** — `proxy_buffering off` must be explicitly set for the streaming route. Without it, responses hang then dump all at once with no error logged anywhere; the symptom looks like TTS latency, not a proxy config issue.
2. **Rollback is manual and slow** — no versioned deploys. Reverting a bad push means `git revert` + re-triggering CI, or SSH-ing in and running the deploy manually. A bad deploy at 11pm costs 20–30 minutes to recover from.
3. **Security patching is entirely your responsibility** — OS packages, Node.js version upgrades, and `npm audit` fixes are all manual. `unattended-upgrades` on Ubuntu handles system packages only; it never touches npm dependencies.
4. **GitHub Actions SSH key rotation is a silent failure** — if the deploy key expires or is rotated and the GitHub Secret is not updated, CI reports a successful workflow run but nothing actually deployed to the server. No built-in detection.
5. **PM2 cluster mode + SSE streams** — cluster mode ties each SSE connection to a specific worker. If that worker restarts mid-conversation, the stream drops. For a single-user app, `instances: 1` is the correct and simpler setting.

### Pre-Mortem — How This Could Fail

The LearnEnglish app launched cleanly on the VPS. GitHub Actions deployed on merge, PM2 managed the process, Cloudflare DNS resolved the subdomain, and SSE streaming worked. Three months later, a Next.js middleware CVE was published. The developer saw the GitHub security advisory but assumed `unattended-upgrades` would apply the patch — it does not cover npm packages. The patch sat unapplied for six weeks.

Meanwhile, a route refactor moved the LLM streaming endpoint from `/api/conversation` to `/sessions/stream`. The nginx `location /api/` block was the only one configured with `proxy_buffering off`. The new path buffered silently — every AI response appeared as a single dump after a 10-second delay rather than streaming. In development everything worked perfectly. In production, the symptom looked like TTS latency, not a proxy config issue. The developer spent four hours debugging before finding the nginx config. The fix was two lines. The cost was an afternoon and a degraded user experience for weeks before the root cause was identified.

### Unknown Unknowns

1. **Cloudflare grey cloud exposes your raw VPS IP** — pointing the subdomain to your VPS with DNS-only (no proxy) means anyone can discover your VPS IP address. For a private single-user app this is low risk, but if the VPS hosts other services, those are now indirectly exposed too.
2. **PM2 cluster mode creates per-worker AI client instances** — if you initialize the OpenAI/Anthropic client once at module level and rely on it being a singleton, cluster mode forks the process and each worker has its own instance. Set `instances: 1` for this app; it sidesteps the issue entirely and is the right call at single-user scale.
3. **`pm2 reload` cuts active SSE streams** — PM2's zero-downtime reload sends SIGINT to the old process and waits for it to drain connections before starting the new one. An active voice session will be terminated mid-conversation on every deploy. Plan deployments between sessions.
4. **`appleboy/ssh-action` can timeout during large builds** — `npm ci` over SSH on a slow or underpowered VPS can hit the action's default timeout. Cache `node_modules` between runs or pass `--prefer-offline` to use the local cache.

## Operational Story

- **Preview deploys**: None — this is a self-hosted single-user app. All deploys go directly to production on merge to `main` via GitHub Actions. Test locally with `npm run dev` before merging.
- **Secrets**: Environment variables stored in a `.env.production` file on the VPS (not committed). GitHub Secrets hold `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` for the deploy workflow. Rotate by updating the file on the VPS and the GitHub Secret.
- **Rollback**: SSH into the VPS, `cd` to the project directory, `git checkout <previous-tag>`, `npm ci && npm run build`, `pm2 reload ecosystem.config.js`. Typical time: 5–15 minutes depending on build time.
- **Approval**: All production actions require a human (deploy is triggered by a merge to `main`; the agent may suggest but not push to `main` unattended). Database operations, SSH key rotation, and nginx config changes are human-only.
- **Logs**: `pm2 logs learn-english` for runtime logs. `pm2 monit` for live process stats. `sudo nginx -t` to validate nginx config. GitHub Actions tab for deploy pipeline logs.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| nginx SSE buffering breaks streaming | Devil's advocate | High | High | Add `proxy_buffering off; proxy_read_timeout 86400s;` to the streaming location block from day one; set `X-Accel-Buffering: no` header in the route handler as a backup |
| npm CVE sits unapplied | Pre-mortem | Medium | Medium | Add `npm audit` step to GitHub Actions CI; fail the build on HIGH/CRITICAL findings |
| Route refactor breaks nginx SSE config | Pre-mortem | Medium | Medium | Configure `proxy_buffering off` on the entire `location /` block, not just `/api/`; simpler and covers all routes |
| SSH deploy key expires silently | Devil's advocate | Low | High | Add a health-check step at the end of the deploy Action that curls the app and fails if it doesn't respond |
| PM2 cluster mode drops SSE streams | Devil's advocate | Medium | Medium | Set `instances: 1` in `ecosystem.config.js`; document this in AGENTS.md as a non-obvious constraint |
| Deploy cuts active voice session | Unknown unknowns | High | Low | Schedule deploys between sessions; add a deploy-time note in the UI (v2 concern) |
| Cloudflare grey cloud exposes VPS IP | Unknown unknowns | High | Low | Acceptable for a private single-user app; document the VPS IP exposure in the ops runbook |
| `appleboy/ssh-action` timeout on slow build | Unknown unknowns | Low | Medium | Cache `node_modules` in the GitHub Action using `actions/cache` |

## Getting Started

1. **Add subdomain DNS in Cloudflare** — create an A record for your subdomain pointing to the VPS IP. Set to DNS only (grey cloud) to avoid Cloudflare proxy buffering SSE streams.
2. **Install Node.js on the VPS** — use `nvm` to install the Node.js version matching your `package.json` `engines` field (or latest LTS). Install PM2 globally: `npm i -g pm2`.
3. **Clone the repo and create `ecosystem.config.js`**:
   ```js
   module.exports = {
     apps: [{
       name: 'learn-english',
       script: 'node_modules/.bin/next',
       args: 'start',
       instances: 1,
       env_production: { NODE_ENV: 'production', PORT: 3000 }
     }]
   }
   ```
4. **Configure nginx** — create `/etc/nginx/sites-available/learn-english` with a server block for your subdomain. Critical SSE directives:
   ```nginx
   location / {
     proxy_pass http://127.0.0.1:3000;
     proxy_http_version 1.1;
     proxy_set_header Connection '';
     proxy_buffering off;
     proxy_cache off;
     proxy_read_timeout 86400s;
   }
   ```
   Run `certbot --nginx -d your-subdomain.yourdomain.com` for SSL.
5. **Wire up GitHub Actions** — store `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` as GitHub Secrets. The deploy step: SSH in, `git pull`, `npm ci`, `npm run build`, `pm2 reload ecosystem.config.js --update-env`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Fly.io / Railway would need this; VPS does not)
- CI/CD pipeline detailed implementation (covered in `/10x-implement`)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare Workers / Pages deployment (dropped — no persistent Node.js support)
