import { db } from '@/db';
import { sessions, transcripts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function truncateAll(): Promise<void> {
  await db.delete(sessions);
}

export async function getTranscriptRow(sessionId: string) {
  const rows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId));
  return rows[0] ?? null;
}
