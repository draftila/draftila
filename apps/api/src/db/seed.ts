import { auth } from '../modules/auth/auth.service';
import { client } from './index';

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

  console.log('Seed completed successfully!');

  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
