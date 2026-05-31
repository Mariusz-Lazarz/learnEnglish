import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../client';
import { sessions, transcripts, lessons } from '../schema';
import type { Message } from '../schema';

export type Session = typeof sessions.$inferSelect;

export type SessionWithLesson = Session & {
  lessonName: string | null;
  messageCount: number;
};

export async function getAllSessions(): Promise<SessionWithLesson[]> {
  const rows = await db
    .select({
      id: sessions.id,
      lessonId: sessions.lessonId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      lessonName: lessons.name,
      messageCount: sql<number>`COALESCE(jsonb_array_length(${transcripts.messages}), 0)`,
    })
    .from(sessions)
    .leftJoin(lessons, eq(sessions.lessonId, lessons.id))
    .leftJoin(transcripts, eq(transcripts.sessionId, sessions.id))
    .orderBy(desc(sessions.startedAt));
  return rows.map((r) => ({ ...r, lessonName: r.lessonName ?? null }));
}

export async function getAllEndedSessions(): Promise<SessionWithLesson[]> {
  const rows = await db
    .select({
      id: sessions.id,
      lessonId: sessions.lessonId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      lessonName: lessons.name,
      messageCount: sql<number>`COALESCE(jsonb_array_length(${transcripts.messages}), 0)`,
    })
    .from(sessions)
    .leftJoin(lessons, eq(sessions.lessonId, lessons.id))
    .leftJoin(transcripts, eq(transcripts.sessionId, sessions.id))
    .where(sql`${sessions.endedAt} IS NOT NULL`)
    .orderBy(desc(sessions.startedAt));
  return rows.map((r) => ({ ...r, lessonName: r.lessonName ?? null }));
}

export async function getSessionById(id: string): Promise<SessionWithLesson | undefined> {
  const rows = await db
    .select({
      id: sessions.id,
      lessonId: sessions.lessonId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      lessonName: lessons.name,
      messageCount: sql<number>`COALESCE(jsonb_array_length(${transcripts.messages}), 0)`,
    })
    .from(sessions)
    .leftJoin(lessons, eq(sessions.lessonId, lessons.id))
    .leftJoin(transcripts, eq(transcripts.sessionId, sessions.id))
    .where(eq(sessions.id, id));
  if (!rows[0]) return undefined;
  return { ...rows[0], lessonName: rows[0].lessonName ?? null };
}

export async function createSession(lessonId?: string): Promise<Session> {
  const rows = await db
    .insert(sessions)
    .values({ lessonId: lessonId ?? null })
    .returning();
  return rows[0];
}

export async function endSession(id: string): Promise<void> {
  await db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function saveTranscript(sessionId: string, messages: Message[]): Promise<void> {
  await db
    .insert(transcripts)
    .values({ sessionId, messages })
    .onConflictDoUpdate({
      target: transcripts.sessionId,
      set: {
        messages,
        updatedAt: sql`now()`,
      },
    });
}

export async function getTranscriptMessages(sessionId: string): Promise<Message[]> {
  const rows = await db
    .select({ messages: transcripts.messages })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId));
  return rows[0]?.messages ?? [];
}
