import { eq, desc } from 'drizzle-orm';
import { db } from '../client';
import { lessons } from '../schema';

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;

export async function getAllLessons(): Promise<Lesson[]> {
  return db.select().from(lessons).orderBy(desc(lessons.createdAt));
}

export async function getLessonById(id: string): Promise<Lesson | undefined> {
  const rows = await db.select().from(lessons).where(eq(lessons.id, id));
  return rows[0];
}

export async function createLesson(data: NewLesson): Promise<Lesson> {
  const rows = await db.insert(lessons).values(data).returning();
  return rows[0];
}

export async function updateLesson(
  id: string,
  data: Partial<NewLesson>
): Promise<Lesson | undefined> {
  const rows = await db
    .update(lessons)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(lessons.id, id))
    .returning();
  return rows[0];
}

export async function deleteLesson(id: string): Promise<void> {
  await db.delete(lessons).where(eq(lessons.id, id));
}
