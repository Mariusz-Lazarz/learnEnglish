import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

const DEFAULT_SYSTEM_PROMPT =
  'You are an English conversation teacher. Speak in English only — never use another language, not even in error corrections. Ask follow-up questions and keep the conversation going. Correct only major errors: invented words or serious structural mistakes that would confuse a native speaker. Do not correct minor slips, articles, contractions, or informal grammar. Keep each response to 1–2 sentences.';

export async function POST(req: Request) {
  const { messages, systemPrompt } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    messages,
  });

  return result.toTextStreamResponse();
}
