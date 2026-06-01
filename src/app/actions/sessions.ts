'use server'

import { revalidatePath } from 'next/cache'
import {
  createSession,
  saveTranscript,
  endSession,
  deleteSession,
  getSessionById,
  reopenSession,
  updateSessionSummary,
} from '@/db'
import type { Message } from '@/db'

export async function startSessionAction(
  lessonId?: string
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

export async function updateSummaryAction(
  sessionId: string,
  summary: string
): Promise<void> {
  try {
    await updateSessionSummary(sessionId, summary)
  } catch {
    // fire-and-forget
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

export async function deleteSessionAction(
  sessionId: string
): Promise<{ error: string } | undefined> {
  try {
    await deleteSession(sessionId)
    revalidatePath('/sessions')
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function resumeSessionAction(
  sessionId: string
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const session = await getSessionById(sessionId)
    if (!session) return { error: 'Session not found' }
    await reopenSession(sessionId)
    return { sessionId }
  } catch {
    return { error: 'Failed to resume session. Please try again.' }
  }
}
