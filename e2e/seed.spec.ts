import { test, expect } from '@playwright/test'

// Auth is handled once in global-setup; individual tests never touch the login form.
test.use({ storageState: 'e2e/.auth/user.json' })

test('mic button is disabled while AI is responding — Risk #3', async ({ page }) => {
  // Unique name prevents collisions in parallel runs and re-runs.
  const lessonName = `Seed Test ${Date.now()}`

  // ── Setup ──────────────────────────────────────────────────────────────────
  await page.goto('/')

  // Create a lesson with the unique name.
  await page.getByRole('button', { name: 'New lesson' }).click()
  await page.getByLabel('Name').fill(lessonName)
  await page.getByLabel('Subject').fill('E2E')
  await page.getByLabel('Conversation goal').fill('Testing mic state during AI response')
  await page.getByRole('button', { name: 'Create lesson' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  // Mock external APIs before navigating to the session page.
  // /api/chat: return quick deterministic text (no real LLM call).
  await page.route('/api/chat', (route) =>
    route.fulfill({ body: 'Great job! Let us practise.', contentType: 'text/plain' })
  )
  // /api/tts: return a minimal silent WAV so audio.onended fires immediately.
  // 44-byte PCM WAV: RIFF header + fmt chunk + empty data chunk (0 samples).
  const silentWav = Buffer.from(
    'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    'base64'
  )
  await page.route('/api/tts', (route) =>
    route.fulfill({ body: silentWav, contentType: 'audio/wav' })
  )

  // Start a session from the newly created lesson card.
  await page
    .getByRole('article', { name: lessonName })
    .getByRole('button', { name: 'Start conversation' })
    .click()
  await page.waitForURL(/\/session\//)

  // ── Assert — Risk #3 core invariant ────────────────────────────────────────
  // The session mounts → AI greeting starts immediately → turnState = 'processing'.
  // The mic button must be disabled during this phase (user cannot record over AI).
  const micButton = page.getByRole('button', { name: 'Hold to speak' })
  await expect(micButton).toBeDisabled()

  // After the mocked greeting completes, turnState returns to 'idle'.
  // If this assertion fails, the state machine never returned to idle — Risk #3 is real.
  await expect(micButton).toBeEnabled({ timeout: 10_000 })

  // ── Cleanup ────────────────────────────────────────────────────────────────
  // End the session.
  await page.getByRole('button', { name: 'End session' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'End session' }).click()
  await page.waitForURL('/')

  // Delete the test lesson.
  await page
    .getByRole('article', { name: lessonName })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('article', { name: lessonName })).not.toBeVisible()
})
