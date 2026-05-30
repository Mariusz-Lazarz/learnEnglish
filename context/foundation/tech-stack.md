---
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
---

## Why this stack

LearnEnglish is a solo-built voice AI conversation app for a single user. Next.js deployed on a self-hosted VPS (`next start` behind nginx + PM2) runs as a persistent Node.js process — no serverless timeout constraints, so LLM streaming responses stay open as long as needed to meet the 3-second voice response NFR. The Vercel AI SDK handles the streaming LLM pipeline with SSE out of the box. shadcn/ui provides the component library for lesson management and session UI — typed, accessible, zero configuration overhead for a solo build. PostgreSQL runs in a Docker container on the same VPS, storing lessons and session transcripts; no managed database service needed at single-user scale. GitHub Actions handles CI with auto-deploy on merge to main via SSH deploy script.
