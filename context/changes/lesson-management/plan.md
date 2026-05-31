# Lesson Management Implementation Plan

## Overview

Build the lesson CRUD UI (S-01). The DB schema and typed DAL are fully implemented (F-01). This slice delivers the user-visible lesson management surface: a home page lesson list, modal forms for create and edit, and a delete confirmation dialog. The lesson form fields (`name`, `subject`, `conversationGoal`, `vocabulary`) become the contract for S-02's AI system prompt.

## Current State Analysis

- **DB schema**: Live. `lessons` table with `id`, `name`, `subject`, `conversation_goal`, `vocabulary`, `created_at`, `updated_at`.
- **DAL**: Live. `getAllLessons`, `getLessonById`, `createLesson`, `updateLesson`, `deleteLesson` exported from `@/db`.
- **Home page** (`src/app/page.tsx`): Boilerplate Next.js placeholder — full replacement needed.
- **Component library**: Not installed. shadcn/ui is listed in CLAUDE.md as planned but absent from `package.json`. Only Tailwind CSS v4 is present.
- **No lesson API routes**: `/api/lessons` does not exist. Not needed — mutations go through Server Actions; the Server Component reads the DB directly.
- **Pipeline-test page**: Uses inline styles; no Tailwind component pattern is established yet.

## Desired End State

- Home page (`/`) shows the lesson list (or empty state) fetched server-side.
- User can create a lesson via a modal dialog with 4 fields.
- User can edit any lesson in the same modal (pre-filled).
- User can delete a lesson with a confirmation alert.
- Each lesson card has a disabled "Start conversation" button as the hook for S-02.
- shadcn/ui is installed and its components are available for all subsequent slices.

### Key Discoveries

- `getAllLessons()` (`src/db/queries/lessons.ts`) orders lessons DESC by `created_at` — no change needed for MVP.
- `updateLesson(id, data)` accepts `Partial<NewLesson>` — server action can pass all four form fields.
- `deleteLesson(id)` performs a hard delete; `session.lesson_id` becomes NULL on associated sessions via ON DELETE SET NULL (by DB design, intentional).
- `react: 19.2.4` is installed — use `useTransition` from React 19; do not use the deprecated `useFormState`.
- `next: 16.2.6` — AGENTS.md warns APIs may differ from training data. Verify Server Action and Server Component patterns against `node_modules/next/dist/docs/` before coding.
- `Lesson` and `NewLesson` types are inferred from Drizzle schema; import via `import type { Lesson } from '@/db'` (re-exported from `src/db/index.ts`).

## What We're NOT Doing

- No `/api/lessons` REST routes — not needed until S-02 requires client-side lesson fetch (S-02 adds if required).
- No lesson reordering, search, or filtering.
- No session count per lesson on the card.
- No "Start conversation" routing logic — button is present and disabled; S-02 activates it.
- No error boundary page (`error.tsx`) — server action errors are surfaced inline in the modal.
- No DB rollback or undo for delete.

## Implementation Approach

Server Components for data reading (home page fetches lessons directly from DB at request time), Server Actions for mutations (create/update/delete call DAL + `revalidatePath('/')`), and shadcn/ui Client Components for the interactive modal and form layer. The cycle: client submits form → server action validates with zod + writes to DB → `revalidatePath('/')` → Next.js re-renders the home Server Component → client sees updated list with no manual state management.

## Critical Implementation Details

**Tailwind v4 + shadcn/ui CSS conflict**: `shadcn@latest init` injects CSS custom properties (color tokens, border-radius) into `globals.css`, typically as an `@layer base {}` block. The project uses Tailwind v4 (`@import "tailwindcss"`). After running `shadcn init`, open `globals.css` and verify: the injected block appears *after* the `@import` line and contains no `@tailwind base/components/utilities` directives (those are v3-only and will break compilation under v4).

**Server Action error contract**: Server actions return `{ error: string }` on failure or `undefined` on success. The form modal treats `undefined` as success and closes; any `{ error }` value is displayed as an inline message without closing the dialog.

**React 19 transitions**: Use `useTransition` to track server action pending state. Call server actions inside `startTransition(async () => { ... })`. The submit button disables and shows a spinner while `isPending`.

**Delete state shape**: The parent `LessonList` component holds `deleteLesson: { id: string; name: string } | null` (not just an ID) so the alert dialog can render the lesson name in the confirmation copy without an extra fetch.

---

## Phase 1: Install and configure shadcn/ui

### Overview

Install shadcn/ui, run init to generate `components.json` and update `globals.css`, then add the 8 component files needed by the lesson management UI.

### Changes Required

#### 1. Initialize shadcn/ui

**File**: `components.json` (created at repo root)

**Intent**: Run `npx shadcn@latest init` interactively to configure shadcn for the project. Accept TypeScript, confirm the `src/` directory, and point at `src/app/globals.css` when prompted.

**Contract**: `components.json` at repo root with `tailwind.css: "src/app/globals.css"`, `aliases.components: "@/components"`, `aliases.utils: "@/lib/utils"`.

#### 2. Add UI components

**Files**: `src/components/ui/button.tsx`, `dialog.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `alert-dialog.tsx`, `card.tsx`

**Intent**: Run `npx shadcn@latest add button dialog form input label textarea alert-dialog card` to generate the 8 component files and install their dependencies.

**Contract**: Each component file is a named export. `src/lib/utils.ts` is created with the `cn()` helper (clsx + tailwind-merge). New runtime `package.json` entries include `@radix-ui/react-*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `zod`.

#### 3. Reconcile globals.css

**File**: `src/app/globals.css`

**Intent**: After `shadcn init` modifies this file, manually verify that shadcn's injected CSS variables are compatible with the existing Tailwind v4 `@import "tailwindcss"` line. Remove any conflicting v3-style directives.

**Contract**: File starts with `@import "tailwindcss";`. Shadcn's CSS custom property block appears after it. No `@tailwind base`, `@tailwind components`, or `@tailwind utilities` directives anywhere in the file.

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run build` exits 0

#### Manual Verification

- `src/components/ui/` contains all 8 listed component files
- `src/lib/utils.ts` exists and exports `cn()`
- `npm run dev` → navigate to `/` → no Tailwind/CSS compilation errors in browser console

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Server actions for lesson mutations

### Overview

Create the three typed server actions that the client components will call. These are the only write paths to the lessons table in this slice.

### Changes Required

#### 1. Lesson mutation actions

**File**: `src/app/actions/lessons.ts`

**Intent**: Define three server actions for lesson CRUD: create, update, and delete. Each validates input, calls the corresponding DAL function, revalidates the home page cache, and returns `{ error: string }` on failure or `undefined` on success. Export the zod schema so the form modal can reuse it for client-side validation.

**Contract**:

```typescript
'use server'

export const lessonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  subject: z.string().min(1, 'Subject is required'),
  conversationGoal: z.string().min(1, 'Conversation goal is required'),
  vocabulary: z.string().optional(),
})

export async function createLessonAction(
  data: z.infer<typeof lessonSchema>
): Promise<{ error: string } | undefined>

export async function updateLessonAction(
  id: string,
  data: z.infer<typeof lessonSchema>
): Promise<{ error: string } | undefined>

export async function deleteLessonAction(
  id: string
): Promise<{ error: string } | undefined>
```

Each calls `revalidatePath('/')` on the success path. Wrap DB calls in try/catch; return `{ error: 'Something went wrong. Please try again.' }` on any thrown error.

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run lint` exits 0 (no unused imports, no `any`)

**Implementation Note**: Actions are tested end-to-end in Phase 4. Pause for manual confirmation after Phase 2 automated checks pass.

---

## Phase 3: Home page (Server Component)

### Overview

Replace the boilerplate home page with a Server Component that fetches all lessons and passes them to the interactive client boundary.

### Changes Required

#### 1. Replace home page

**File**: `src/app/page.tsx`

**Intent**: Replace all boilerplate JSX (Next.js logo, placeholder links) with a minimal Server Component. Fetch lessons via `getAllLessons()` and render the page shell plus `<LessonList>`.

**Contract**:
- No `'use client'` directive — Server Component.
- Imports: `getAllLessons` from `@/db`, `LessonList` from `./_components/lesson-list`.
- Top-level structure: `<main>` wrapper with page heading ("My Lessons") and `<LessonList lessons={lessons} />`.
- Remove `next/image` import and all placeholder JSX.

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run build` exits 0

#### Manual Verification

- `npm run dev` → navigate to `/` → page renders without console errors

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Client components

### Overview

Build the four client components that compose the interactive lesson management surface.

### Changes Required

#### 1. Lesson list manager

**File**: `src/app/_components/lesson-list.tsx`

**Intent**: Client Component that owns all interactive state for the lesson management page. Receives lessons from the Server Component as props and renders either the empty state or the lesson card grid, plus all modal/dialog instances.

**Contract**:
- `'use client'`
- Props: `{ lessons: Lesson[] }` (import `Lesson` type from `@/db`)
- State: `isCreateOpen: boolean`, `editLesson: Lesson | null`, `deleteLesson: { id: string; name: string } | null`
- Empty state (when `lessons.length === 0`): centered "No lessons yet." message + Button "Create your first lesson" that sets `isCreateOpen = true`
- Non-empty state: renders `<LessonCard>` for each lesson with `onEdit={(lesson) => setEditLesson(lesson)}` and `onDelete={(id, name) => setDeleteLesson({ id, name })}` callbacks
- Always renders `<LessonFormModal>` (for create when `isCreateOpen`, for edit when `editLesson !== null`) and `<DeleteLessonAlert>`
- "New lesson" button in the top-right area that sets `isCreateOpen = true`

#### 2. Lesson card

**File**: `src/app/_components/lesson-card.tsx`

**Intent**: Renders one lesson's data in a shadcn Card. Exposes three action buttons: disabled "Start conversation" (S-02 placeholder), "Edit" (calls `onEdit`), "Delete" (calls `onDelete`).

**Contract**:
- Props: `{ lesson: Lesson; onEdit: (lesson: Lesson) => void; onDelete: (id: string, name: string) => void }`
- Card content: `lesson.name` as heading, `lesson.subject` as muted subheading, `lesson.conversationGoal` (truncated to one line via CSS), `lesson.vocabulary` if non-null (truncated to one line)
- "Start conversation": shadcn Button, `disabled` attribute, `title="Coming soon"`, does not navigate
- "Edit": shadcn Button variant ghost/outline, calls `onEdit(lesson)`
- "Delete": shadcn Button variant ghost/destructive, calls `onDelete(lesson.id, lesson.name)`

#### 3. Lesson form modal

**File**: `src/app/_components/lesson-form-modal.tsx`

**Intent**: shadcn Dialog containing a react-hook-form form with zod validation. Serves both create (no `lesson` prop) and edit (pre-filled from `lesson` prop). Calls `createLessonAction` or `updateLessonAction`, shows inline error on failure, closes dialog on success.

**Contract**:
- `'use client'`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; lesson?: Lesson | null }`
- Uses `useForm` with `resolver: zodResolver(lessonSchema)` (import `lessonSchema` from `@/app/actions/lessons`)
- `useEffect` watching `lesson` and `open`: when dialog opens, call `form.reset()` — with lesson values when editing, with empty defaults when creating
- Four shadcn Form fields: Name (Input), Subject (Input), Conversation goal (Textarea rows=3), Vocabulary (Textarea rows=2, label suffix "(optional)")
- Submit calls `startTransition(async () => { const result = await action(data); if (result?.error) { form.setError('root', { message: result.error }) } else { onOpenChange(false) } })`
- Submit button: `disabled={isPending}`, shows spinner icon from lucide-react while pending
- Dialog title: "New lesson" when creating, "Edit lesson" when editing

#### 4. Delete lesson alert

**File**: `src/app/_components/delete-lesson-alert.tsx`

**Intent**: shadcn AlertDialog that asks the user to confirm deletion of a named lesson, then calls `deleteLessonAction`. Closes on cancel or successful delete; shows inline error on failure.

**Contract**:
- `'use client'`
- Props: `{ lesson: { id: string; name: string } | null; onOpenChange: (open: boolean) => void }`
- `open` derived from `lesson !== null`
- Alert description: `Delete "${lesson.name}"? This cannot be undone.`
- Confirm (destructive) button: `disabled={isPending}`, spinner while pending
- On confirm: `startTransition(async () => { const result = await deleteLessonAction(lesson.id); if (result?.error) { setError(result.error) } else { onOpenChange(false) } })`
- Error displayed as text below the confirm button when present

### Success Criteria

#### Automated Verification

- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification

- Empty state: "No lessons yet." message and "Create your first lesson" button visible when DB has no lessons
- Create: click "Create your first lesson" → modal opens with 4 empty fields → fill all required fields → submit → lesson appears in list, modal closes
- Edit: click "Edit" on a lesson card → modal opens pre-filled with saved values → change name → save → card shows updated name
- Delete: click "Delete" on a lesson card → alert shows correct lesson name → confirm → lesson removed from list
- "Start conversation" button visible but disabled on each card, no navigation on click
- No errors in browser console during any CRUD flow

**Implementation Note**: Pause for manual confirmation after completing all Phase 4 manual tests.

---

## Testing Strategy

### Unit Tests
No test runner configured — no unit tests in this change.

### Integration Tests
None in this change.

### Manual Testing Steps
1. `npm run dev`
2. Navigate to `localhost:3000`
3. Verify empty state: "No lessons yet." + "Create your first lesson" button
4. Create a lesson: name "Daily conversation", subject "General topics", goal "Practice casual small talk", vocabulary "definitely, actually, I suppose"
5. Verify lesson card appears with name, subject, and both text fields visible (truncated if long)
6. Click "Edit" → verify pre-fill → change name to "Daily conversation v2" → save → verify updated name
7. Create a second lesson
8. Click "Delete" on first lesson → verify alert body contains the lesson name → confirm → verify removed from list
9. Click "Start conversation" on remaining card → verify it does not navigate and is visually disabled

## Performance Considerations

`getAllLessons()` has no `.limit()` clause — acceptable for a single-user app with a small number of lessons. Server Component fetch happens at request time; no client-side data fetching layer to invalidate.

## Migration Notes

No schema changes in this slice — F-01 already covers the `lessons` table.

## References

- DAL: `src/db/queries/lessons.ts`
- DB schema: `src/db/schema.ts`
- Roadmap S-01: `context/foundation/roadmap.md` (see S-01 entry)
- F-01 impl review: `context/changes/db-schema-data-access/reviews/impl-review.md` (F-10 — lesson delete nullifies session.lesson_id, accepted behavior)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install and configure shadcn/ui

#### Automated

- [x] 1.1 `npm run typecheck` exits 0 — c038edc
- [x] 1.2 `npm run build` exits 0 — c038edc

#### Manual

- [ ] 1.3 `src/components/ui/` contains all 8 component files and `src/lib/utils.ts` exists
- [ ] 1.4 No Tailwind/CSS compilation errors in browser console on `npm run dev`

### Phase 2: Server actions for lesson mutations

#### Automated

- [x] 2.1 `npm run typecheck` exits 0
- [x] 2.2 `npm run lint` exits 0

### Phase 3: Home page (Server Component)

#### Automated

- [ ] 3.1 `npm run typecheck` exits 0
- [ ] 3.2 `npm run build` exits 0

#### Manual

- [ ] 3.3 Home page renders without console errors at `localhost:3000`

### Phase 4: Client components

#### Automated

- [ ] 4.1 `npm run typecheck` exits 0
- [ ] 4.2 `npm run lint` exits 0
- [ ] 4.3 `npm run build` exits 0

#### Manual

- [ ] 4.4 Empty state renders correctly when DB has no lessons
- [ ] 4.5 Create lesson: modal opens → fill fields → submit → lesson appears in list
- [ ] 4.6 Edit lesson: modal pre-fills → change name → save → card reflects update
- [ ] 4.7 Delete lesson: alert shows correct name → confirm → lesson removed
- [ ] 4.8 "Start conversation" button visible and disabled on each card
- [ ] 4.9 No browser console errors during any CRUD flow
