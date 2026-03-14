import { auth } from '../modules/auth/auth.service';
import { client } from './index';

/**
 * Seed the database with a test user via better-auth's API,
 * which ensures the password is hashed correctly.
 *
 * Credentials:
 *   email:    test@draftila.com
 *   password: password123
 */
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
