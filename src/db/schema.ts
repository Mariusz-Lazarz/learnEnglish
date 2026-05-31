import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  conversationGoal: text('conversation_goal').notNull(),
  vocabulary: text('vocabulary'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  startedAt: tstz('started_at').notNull().defaultNow(),
  endedAt: tstz('ended_at'),
});

export const transcripts = pgTable(
  'transcripts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    messages: jsonb('messages').notNull().default(sql`'[]'`).$type<Message[]>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('transcripts_session_id_idx').on(table.sessionId)]
);
