import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { env } from '../../common/lib/env';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

const isTest = process.env.NODE_ENV === 'test';

const testPasswordConfig = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async ({ hash, password }: { hash: string; password: string }) =>
    hash === `hashed:${password}`,
};

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: env.DB_DRIVER }),
  emailAndPassword: {
    enabled: true,
    ...(isTest && { password: testPasswordConfig }),
  },
  trustedOrigins: [env.FRONTEND_URL],
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db.project.create({
            data: {
              id: nanoid(),
              name: 'Personal',
              isPersonal: true,
              ownerId: user.id,
            },
          });
        },
      },
    },
  },
});
