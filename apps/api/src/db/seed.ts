import { auth } from '../modules/auth/auth.service';
import { db } from './index';

const allowedEnvs = ['development', 'test'];
if (!allowedEnvs.includes(process.env.NODE_ENV ?? 'development')) {
  console.error('Refusing to run seed in production environment');
  process.exit(1);
}

async function seed() {
  const result = await auth.api.signUpEmail({
    body: {
      email: 'test@draftila.com',
      password: 'password',
      name: 'Test User',
    },
  });

  if (!result?.user) {
    console.error('Failed to create user');
    process.exit(1);
  }

  await db.user.update({ where: { id: result.user.id }, data: { role: 'admin' } });

  console.log('Seed completed successfully!');

  await db.$disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
