import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL!;
export const client = postgres(connectionString, {
  max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
