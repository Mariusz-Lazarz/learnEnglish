# Lesson Management — Plan Brief

> Full plan: `context/changes/lesson-management/plan.md`

## What & Why

Build the lesson create/edit/delete UI (roadmap S-01). The DB schema and DAL are fully implemented (F-01), so this slice is purely a UI problem. Lessons are the entry point for every voice session — a user who can't create and manage lessons can't reach the product's north star (S-02).

## Starting Point

`src/app/page.tsx` is the Next.js boilerplate placeholder. shadcn/ui is absent from `package.json` (listed as planned in CLAUDE.md but never installed). The DAL exposes all five CRUD functions from `@/db`, ready to call.

## Desired End State

The home page (`/`) shows a lesson list with a "New lesson" button. Clicking it opens a modal form with four fields. Each lesson card has Edit, Delete, and a disabled "Start conversation" button. Deleting asks for confirmation. shadcn/ui is installed and its components are available for S-02 and S-03 to use.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Lesson list URL | `/` (home page) | Single-user app with no dashboard — opening directly to lessons is zero friction. | Plan |
| Create/edit UI | Modal dialog | Stays on the list page, no navigation cost; shadcn Dialog is reusable across slices. | Plan |
| Component library | shadcn/ui | CLAUDE.md listed it as planned; first real UI work is the right time to install. | Plan |
| Mutation approach | Server Actions | Type-safe, no REST boilerplate; `revalidatePath('/')` handles list refresh automatically. | Plan |
| Delete UX | Simple confirm, silent orphan | ON DELETE SET NULL is already the DB design; single-user app, no need to warn. | Plan |
| S-02 handoff button | Disabled placeholder on card | S-02 has an exact hook point; the page feels complete and intentional. | Plan |
| Empty state | Minimal CTA | "No lessons yet" + "Create your first lesson" — actionable, no onboarding copy needed. | Plan |

## Scope

**In scope:** shadcn/ui install + 8 UI components, 3 server actions with zod validation, home page Server Component (lesson list), 4 client components (list, card, form modal, delete alert), disabled S-02 CTA.

**Out of scope:** `/api/lessons` REST routes, session count on cards, lesson search/filter/sort, "Start conversation" routing logic, error boundary page, DB migrations.

## Architecture / Approach

```
page.tsx (Server Component)
  └─ getAllLessons() → DB
  └─ <LessonList lessons={...}> (Client Component)
        ├─ <LessonCard> × N  ──[onEdit / onDelete]──┐
        ├─ <LessonFormModal>  ←── createLessonAction │
        │                     ←── updateLessonAction │
        └─ <DeleteLessonAlert> ←── deleteLessonAction┘
                                     ↓
                            revalidatePath('/') → Server re-render
```

Server Actions return `{ error: string } | undefined`. Client modals close on `undefined`, display inline error on `{ error }`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Install shadcn/ui | 8 UI components, zod, react-hook-form in place | Tailwind v4 CSS variable conflict after `shadcn init` — check globals.css manually |
| 2. Server actions | `createLessonAction`, `updateLessonAction`, `deleteLessonAction` with zod | Straightforward; risk is low |
| 3. Home page | Server Component replacing boilerplate placeholder | Straightforward |
| 4. Client components | Full interactive lesson management surface | Largest phase; form modal state (pre-fill on edit, reset on open) is the fiddly part |

**Prerequisites:** F-01 (db-schema-data-access) must be `impl_reviewed` ✓ — it is.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- `shadcn@latest` with Tailwind v4 may inject conflicting CSS. Reconcile `globals.css` manually after `shadcn init` (see Critical Implementation Details in `plan.md`).
- `next: 16.2.6` — verify Server Action and Server Component API against `node_modules/next/dist/docs/` before coding (AGENTS.md warning).
- `getAllLessons()` has no `.limit()` — acceptable for single-user MVP, flagged in F-01 impl review (F-06).

## Success Criteria (Summary)

- User can create, edit, and delete a lesson from the home page without page navigation.
- Each lesson card shows all four fields and has a visible (but disabled) "Start conversation" button.
- `npm run build` and `npm run typecheck` pass after each phase.
