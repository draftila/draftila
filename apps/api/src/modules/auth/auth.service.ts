import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { env } from '../../common/lib/env';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

type AdminPlugin = ReturnType<typeof admin<Record<never, never>>>;
type AppAuthOptions = Omit<BetterAuthOptions, 'plugins'> & { plugins: [AdminPlugin] };

const adminPlugin: AdminPlugin = admin({});

export const auth: Auth<AppAuthOptions> = betterAuth<AppAuthOptions>({
  basePath: '/api/auth',
  database: prismaAdapter(db, { provider: env.DB_DRIVER }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: env.FRONTEND_URLS,
  plugins: [adminPlugin],
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
