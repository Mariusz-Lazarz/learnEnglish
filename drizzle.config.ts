import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.production' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
