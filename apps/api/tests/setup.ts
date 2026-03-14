/**
 * Test preload script.
 * Sets environment variables BEFORE any src modules are imported,
 * creates the test database if needed, and runs migrations.
 */

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/draftila_test';
process.env.BETTER_AUTH_SECRET = 'test-secret-at-least-32-characters-long-for-tests';
process.env.BETTER_AUTH_URL = 'http://localhost:3001';
process.env.FRONTEND_URL = 'http://localhost:5173';

import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Create test database if it doesn't exist
const adminSql = postgres('postgresql://postgres:postgres@localhost:5432/postgres');
try {
  await adminSql`CREATE DATABASE draftila_test`;
} catch {
  // Already exists
}
await adminSql.end();

// Run migrations on test database
const { db } = await import('../src/db');
await migrate(db, { migrationsFolder: './src/db/migrations' });
