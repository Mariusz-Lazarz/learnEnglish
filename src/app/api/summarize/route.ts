import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system:
      'Summarize this English learning conversation in 2–3 sentences. Mention the topics practiced, key phrases covered, and the student\'s approximate level. Be concise.',
    messages,
  })

  return Response.json({ summary: text })
}
