import { parseArgs } from 'node:util';
import {
  AdminAccountError,
  createAdminAccount,
  demoteAdminAccount,
  inspectAccount,
  listAdminAccounts,
  promoteAdminAccount,
  resetAdminPassword,
} from './admin-accounts';
import { readSecretFromStdin } from './command-input';
import { db } from '../db';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    email: { type: 'string', short: 'e' },
    name: { type: 'string', short: 'n' },
    'password-stdin': { type: 'boolean' },
  },
});

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new AdminAccountError(`Missing required argument: --${name}`);
  return value;
}

async function requirePassword(): Promise<string> {
  if (!values['password-stdin']) {
    throw new AdminAccountError('Password input requires --password-stdin');
  }
  return readSecretFromStdin();
}

async function run(): Promise<unknown> {
  const action = positionals[0];
  if (action === 'list') return listAdminAccounts();
  if (action === 'inspect') return inspectAccount(requireValue(values.email, 'email'));
  if (action === 'create') {
    return createAdminAccount({
      email: requireValue(values.email, 'email'),
      name: requireValue(values.name, 'name'),
      password: await requirePassword(),
    });
  }
  if (action === 'promote') return promoteAdminAccount(requireValue(values.email, 'email'));
  if (action === 'reset-password') {
    await resetAdminPassword(requireValue(values.email, 'email'), await requirePassword());
    return { success: true };
  }
  if (action === 'demote') {
    await demoteAdminAccount(requireValue(values.email, 'email'));
    return { success: true };
  }
  throw new AdminAccountError(
    'Usage: db:admin <list|inspect|create|promote|reset-password|demote>',
  );
}

run()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Administrator command failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
