import type { Message } from '@/db'

export const CONTEXT_WINDOW_SIZE = 10
export const SUMMARY_EVERY_N_MESSAGES = 20

export function buildAIContext(
  messages: Message[],
  rollingSummary: string | null | undefined
): { role: 'user' | 'assistant'; content: string }[] {
  const window = messages.slice(-CONTEXT_WINDOW_SIZE).map(({ role, content }) => ({ role, content }))

  if (!rollingSummary) return window

  return [
    { role: 'user' as const, content: `[Summary of our conversation so far: ${rollingSummary}]` },
    { role: 'assistant' as const, content: 'Understood, I remember our conversation.' },
    ...window,
  ]
}
