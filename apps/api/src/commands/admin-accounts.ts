import { hashPassword } from 'better-auth/crypto';
import { db } from '../db';
import { auth } from '../modules/auth/auth.service';

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
}

export interface AccountInspection extends AdminAccount {
  role: 'admin' | 'user';
}

export class AdminAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAccountError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 8) throw new AdminAccountError('Password must be at least 8 characters');
  if (password.length > 128) throw new AdminAccountError('Password must be at most 128 characters');
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  return db.user.findMany({
    where: { role: 'admin' },
    select: { id: true, email: true, name: true },
    orderBy: { email: 'asc' },
  });
}

export async function inspectAccount(email: string): Promise<AccountInspection | null> {
  const account = await db.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role === 'admin' ? 'admin' : 'user',
  };
}

export async function createAdminAccount(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AdminAccount> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email) throw new AdminAccountError('Email is required');
  if (!name) throw new AdminAccountError('Name is required');
  validatePassword(input.password);
  if (await db.user.findUnique({ where: { email } })) {
    throw new AdminAccountError(`An account already exists for ${email}`);
  }
  const result = await auth.api.signUpEmail({ body: { email, password: input.password, name } });
  if (!result?.user) throw new AdminAccountError('Failed to create administrator account');
  return db.user.update({
    where: { id: result.user.id },
    data: { role: 'admin' },
    select: { id: true, email: true, name: true },
  });
}

export async function promoteAdminAccount(email: string): Promise<AdminAccount> {
  const normalizedEmail = normalizeEmail(email);
  const account = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!account) throw new AdminAccountError(`No account exists for ${normalizedEmail}`);
  return db.$transaction(async (transaction) => {
    const administrator = await transaction.user.update({
      where: { id: account.id },
      data: { role: 'admin' },
      select: { id: true, email: true, name: true },
    });
    await transaction.session.deleteMany({ where: { userId: account.id } });
    return administrator;
  });
}

export async function resetAdminPassword(email: string, password: string): Promise<void> {
  validatePassword(password);
  const normalizedEmail = normalizeEmail(email);
  const account = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true },
  });
  if (!account || account.role !== 'admin') {
    throw new AdminAccountError(`No administrator exists for ${normalizedEmail}`);
  }
  const passwordHash = await hashPassword(password);
  const updated = await db.account.updateMany({
    where: { userId: account.id, providerId: 'credential' },
    data: { password: passwordHash },
  });
  if (updated.count === 0) {
    throw new AdminAccountError(`No password credential exists for ${normalizedEmail}`);
  }
  await db.session.deleteMany({ where: { userId: account.id } });
}

export async function demoteAdminAccount(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  await db.$transaction(async (transaction) => {
    const account = await transaction.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    });
    if (!account || account.role !== 'admin') {
      throw new AdminAccountError(`No administrator exists for ${normalizedEmail}`);
    }
    const administratorCount = await transaction.user.count({ where: { role: 'admin' } });
    if (administratorCount <= 1) {
      throw new AdminAccountError('The last administrator cannot be removed');
    }
    await transaction.user.update({ where: { id: account.id }, data: { role: 'user' } });
    await transaction.session.deleteMany({ where: { userId: account.id } });
  });
}
