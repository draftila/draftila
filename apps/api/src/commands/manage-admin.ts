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

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new AdminAccountError(`Missing required argument: --${name}`);
  return value;
}

async function requirePassword(passwordStdin: boolean | undefined): Promise<string> {
  if (!passwordStdin) {
    throw new AdminAccountError('Password input requires --password-stdin');
  }
  return readSecretFromStdin();
}

export async function runManageAdmin(args: string[]): Promise<unknown> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      email: { type: 'string', short: 'e' },
      name: { type: 'string', short: 'n' },
      'password-stdin': { type: 'boolean' },
    },
  });
  const action = positionals[0];
  if (action === 'list') return listAdminAccounts();
  if (action === 'inspect') return inspectAccount(requireValue(values.email, 'email'));
  if (action === 'create') {
    return createAdminAccount({
      email: requireValue(values.email, 'email'),
      name: requireValue(values.name, 'name'),
      password: await requirePassword(values['password-stdin']),
    });
  }
  if (action === 'promote') return promoteAdminAccount(requireValue(values.email, 'email'));
  if (action === 'reset-password') {
    await resetAdminPassword(
      requireValue(values.email, 'email'),
      await requirePassword(values['password-stdin']),
    );
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

export async function runManageAdminCommand(args = process.argv.slice(2)): Promise<void> {
  try {
    console.log(JSON.stringify(await runManageAdmin(args)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Administrator command failed');
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.main) await runManageAdminCommand();
