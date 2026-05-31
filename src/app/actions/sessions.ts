'use server'

import { revalidatePath } from 'next/cache'
import { createSession, saveTranscript, endSession, deleteSession, getSessionById, getTranscriptMessages } from '@/db'
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
  oldSessionId: string
): Promise<{ newSessionId: string } | { error: string }> {
  try {
    const oldSession = await getSessionById(oldSessionId)
    if (!oldSession) return { error: 'Session not found' }
    const priorMessages = await getTranscriptMessages(oldSessionId)
    const newSession = await createSession(oldSession.lessonId ?? undefined)
    if (priorMessages.length > 0) {
      await saveTranscript(newSession.id, priorMessages)
    }
    return { newSessionId: newSession.id }
  } catch {
    return { error: 'Failed to resume session. Please try again.' }
  }
}
