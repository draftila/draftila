import { parseArgs } from 'node:util';
import { createAdminAccount, inspectAccount, promoteAdminAccount } from './admin-accounts';
import { readSecretFromStdin } from './command-input';
import { db } from '../db';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    email: { type: 'string', short: 'e' },
    password: { type: 'string', short: 'p' },
    'password-stdin': { type: 'boolean' },
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
const name = values.name ?? 'Admin';

async function createAdmin() {
  const existing = await inspectAccount(email);
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`Admin account already exists: ${email}`);
    } else {
      await promoteAdminAccount(email);
      console.log(`Promoted existing user to admin: ${email}`);
    }
    return;
  }
  const password = values['password-stdin']
    ? await readSecretFromStdin()
    : requireArg(values.password, 'password');
  await createAdminAccount({ email, password, name });
  console.log(`Admin account created: ${email}`);
}

createAdmin()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
