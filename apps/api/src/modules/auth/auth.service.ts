import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { env } from '../../common/lib/env';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

export const auth = betterAuth({
  basePath: '/api/auth',
  database: prismaAdapter(db, { provider: env.DB_DRIVER }),
  emailAndPassword: {
    enabled: true,
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
