'use client'

interface ConversationClientProps {
  sessionId: string
  lessonName: string
  systemPrompt: string
}

export function ConversationClient({ lessonName }: ConversationClientProps) {
  return (
    <div>
      <h1>{lessonName}</h1>
      <p>Loading…</p>
    </div>
  )
}
