'use server'

import { createSession, saveTranscript, endSession } from '@/db'
import type { Message } from '@/db'

export async function startSessionAction(
  lessonId: string
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const session = await createSession(lessonId)
    return { sessionId: session.id }
  } catch {
    return { error: 'Failed to start session. Please try again.' }
  }
}

export async function saveTranscriptAction(
  sessionId: string,
  messages: Message[]
): Promise<void> {
  try {
    await saveTranscript(sessionId, messages)
  } catch {
    // fire-and-forget; failures are silent
  }
}

export async function endSessionAction(
  sessionId: string,
  messages: Message[]
): Promise<{ error: string } | undefined> {
  try {
    await saveTranscript(sessionId, messages)
    await endSession(sessionId)
  } catch {
    return { error: 'Failed to end session. Please try again.' }
  }
}
