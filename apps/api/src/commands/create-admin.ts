import { parseArgs } from 'node:util';
import { auth } from '../modules/auth/auth.service';
import { db } from '../db';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    email: { type: 'string', short: 'e' },
    password: { type: 'string', short: 'p' },
    name: { type: 'string', short: 'n' },
  },
});

function requireArg(value: string | undefined, flag: string): string {
  if (!value) {
    console.error(`Missing required argument: --${flag}`);
    console.error('Usage: create-admin --email <email> --password <password> [--name <name>]');
    process.exit(1);
  }
  return value;
}

const email = requireArg(values.email, 'email');
const password = requireArg(values.password, 'password');
const name = values.name ?? 'Admin';

if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

async function createAdmin() {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`Admin account already exists: ${email}`);
    } else {
      await db.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
      console.log(`Promoted existing user to admin: ${email}`);
    }
    await db.$disconnect();
    return;
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  if (!result?.user) {
    console.error('Failed to create admin account');
    process.exit(1);
  }

  await db.user.update({ where: { id: result.user.id }, data: { role: 'admin' } });
  console.log(`Admin account created: ${email}`);

  await db.$disconnect();
}

createAdmin().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
