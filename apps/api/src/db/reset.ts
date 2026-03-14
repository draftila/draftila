import { sql } from 'drizzle-orm';
import { db, client } from './index';

const allowedEnvs = ['development', 'test'];
if (!allowedEnvs.includes(process.env.NODE_ENV ?? 'development')) {
  console.error('Refusing to run reset in production environment');
  process.exit(1);
}

async function reset() {
  console.log('Dropping all tables...');

  await db.execute(sql`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

  console.log('All tables dropped.');
  await client.end();
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
