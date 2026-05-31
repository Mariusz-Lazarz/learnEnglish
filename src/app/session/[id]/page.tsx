import { notFound, redirect } from 'next/navigation'
import { getSessionById, getLessonById, getTranscriptMessages } from '@/db'
import { buildSystemPrompt, FREE_CONVERSATION_SYSTEM_PROMPT } from '@/lib/system-prompt'
import { ConversationClient } from './_components/conversation-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: PageProps) {
  const { id } = await params
  const session = await getSessionById(id)

  if (!session) {
    notFound()
  }

  if (session.endedAt !== null) {
    redirect('/')
  }

  const lesson = session.lessonId ? await getLessonById(session.lessonId) : null
  const systemPrompt = lesson ? buildSystemPrompt(lesson) : FREE_CONVERSATION_SYSTEM_PROMPT
  const priorMessages = await getTranscriptMessages(session.id)

  return (
    <main>
      <ConversationClient
        sessionId={session.id}
        lessonName={lesson?.name ?? 'Free conversation'}
        systemPrompt={systemPrompt}
        initialMessages={priorMessages.length > 0 ? priorMessages : undefined}
      />
    </main>
  )
}
