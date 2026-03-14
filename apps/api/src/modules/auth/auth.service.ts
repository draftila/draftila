import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '../../common/lib/env';
import { db } from '../../db';
import * as schema from '../../db/schema';

const isTest = process.env.NODE_ENV === 'test';

const testPasswordConfig = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async ({ hash, password }: { hash: string; password: string }) =>
    hash === `hashed:${password}`,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    ...(isTest && { password: testPasswordConfig }),
  },
  trustedOrigins: [env.FRONTEND_URL],
});
