import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, getTranscriptMessages, getSessionById } from '@/db';
import { endSessionAction } from '@/app/actions/sessions';
import { truncateAll, getTranscriptRow } from '@/test/helpers';
import type { Message } from '@/db';

const testMessages: Message[] = [
  { role: 'user', content: 'Hello', timestamp: '2026-06-01T10:00:00.000Z' },
  { role: 'assistant', content: 'Hi there!', timestamp: '2026-06-01T10:00:01.000Z' },
];

describe('endSessionAction', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates a transcript row for a zero-turn session', async () => {
    const session = await createSession();
    const result = await endSessionAction(session.id, []);
    expect(result).toBeUndefined();
    const saved = await getSessionById(session.id);
    expect(saved?.endedAt).not.toBeNull();
    const row = await getTranscriptRow(session.id);
    expect(row).not.toBeNull();
    const messages = await getTranscriptMessages(session.id);
    expect(messages).toEqual([]);
  });

  it('saves the transcript and sets ended_at', async () => {
    const session = await createSession();
    const result = await endSessionAction(session.id, testMessages);
    expect(result).toBeUndefined();
    const saved = await getSessionById(session.id);
    expect(saved?.endedAt).not.toBeNull();
    const messages = await getTranscriptMessages(session.id);
    expect(messages).toHaveLength(testMessages.length);
    expect(messages[0].content).toBe(testMessages[0].content);
    expect(messages[1].content).toBe(testMessages[1].content);
  });
});
