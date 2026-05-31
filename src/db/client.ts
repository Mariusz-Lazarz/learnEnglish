import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

const client = globalThis._pgClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== 'production') globalThis._pgClient = client;

export const db = drizzle(client, { schema });
