import { beforeEach, describe, expect, test } from 'bun:test';
import { verifyPassword } from 'better-auth/crypto';
import {
  createAdminAccount,
  demoteAdminAccount,
  inspectAccount,
  listAdminAccounts,
  promoteAdminAccount,
  resetAdminPassword,
} from '../../src/commands/admin-accounts';
import { db } from '../../src/db';
import { auth } from '../../src/modules/auth/auth.service';
import { cleanDatabase, makeAdmin } from '../helpers';

async function createUser(
  data = {
    email: 'test@draftila.com',
    password: 'password123',
    name: 'Test User',
  },
) {
  const result = await auth.api.signUpEmail({ body: data });
  if (!result?.user) throw new Error('Failed to create test user');
  return result;
}

beforeEach(async () => {
  await cleanDatabase();
});

describe('administrator accounts', () => {
  test('creates and lists administrators', async () => {
    const created = await createAdminAccount({
      email: ' Admin@Example.com ',
      name: 'Local Admin',
      password: 'password123',
    });
    expect(created.email).toBe('admin@example.com');
    expect(await listAdminAccounts()).toEqual([created]);
    expect(await inspectAccount('ADMIN@example.com')).toEqual({ ...created, role: 'admin' });
  });

  test('lists administrators in email order and excludes regular users', async () => {
    const second = await createUser({
      email: 'z@example.com',
      password: 'password123',
      name: 'Zed',
    });
    const first = await createUser({
      email: 'a@example.com',
      password: 'password123',
      name: 'Aye',
    });
    await makeAdmin(second.user.id);
    await makeAdmin(first.user.id);
    await createUser({
      email: 'user@example.com',
      password: 'password123',
      name: 'User',
    });
    expect((await listAdminAccounts()).map((account) => account.email)).toEqual([
      'a@example.com',
      'z@example.com',
    ]);
  });

  test('inspects missing and regular accounts', async () => {
    expect(await inspectAccount('missing@example.com')).toBeNull();
    const created = await createUser();
    expect(await inspectAccount(created.user.email)).toEqual({
      id: created.user.id,
      email: created.user.email,
      name: created.user.name,
      role: 'user',
    });
  });

  test('validates new administrator input', async () => {
    await expect(
      createAdminAccount({ email: '', name: 'Admin', password: 'password123' }),
    ).rejects.toThrow('Email is required');
    await expect(
      createAdminAccount({ email: 'admin@example.com', name: ' ', password: 'password123' }),
    ).rejects.toThrow('Name is required');
    await expect(
      createAdminAccount({ email: 'admin@example.com', name: 'Admin', password: 'short' }),
    ).rejects.toThrow('at least 8');
    await expect(
      createAdminAccount({ email: 'admin@example.com', name: 'Admin', password: 'x'.repeat(129) }),
    ).rejects.toThrow('at most 128');
    await createUser({ email: 'admin@example.com', password: 'password123', name: 'Admin' });
    await expect(
      createAdminAccount({
        email: 'admin@example.com',
        name: 'Admin',
        password: 'password123',
      }),
    ).rejects.toThrow('already exists');
  });

  test('promotes an existing user and rejects a missing account', async () => {
    const created = await createUser();
    expect(await db.session.count({ where: { userId: created.user.id } })).toBeGreaterThan(0);
    expect((await promoteAdminAccount(created.user.email)).email).toBe(created.user.email);
    expect((await db.user.findUnique({ where: { id: created.user.id } }))?.role).toBe('admin');
    expect(await db.session.count({ where: { userId: created.user.id } })).toBe(0);
    await expect(promoteAdminAccount('missing@example.com')).rejects.toThrow('No account');
  });

  test('resets an administrator password and revokes sessions', async () => {
    const created = await createUser();
    await makeAdmin(created.user.id);
    expect(await db.session.count({ where: { userId: created.user.id } })).toBeGreaterThan(0);
    await resetAdminPassword(created.user.email, 'new-password-123');
    const credential = await db.account.findFirstOrThrow({
      where: { userId: created.user.id, providerId: 'credential' },
    });
    expect(await verifyPassword({ hash: credential.password!, password: 'new-password-123' })).toBe(
      true,
    );
    expect(await db.session.count({ where: { userId: created.user.id } })).toBe(0);
  });

  test('rejects invalid password reset targets', async () => {
    await expect(resetAdminPassword('missing@example.com', 'password123')).rejects.toThrow(
      'No administrator',
    );
    const user = await createUser();
    await expect(resetAdminPassword(user.user.email, 'password123')).rejects.toThrow(
      'No administrator',
    );
    await makeAdmin(user.user.id);
    await db.account.deleteMany({ where: { userId: user.user.id } });
    await expect(resetAdminPassword(user.user.email, 'password123')).rejects.toThrow(
      'No password credential',
    );
    await expect(resetAdminPassword(user.user.email, 'short')).rejects.toThrow('at least 8');
    await expect(resetAdminPassword(user.user.email, 'x'.repeat(129))).rejects.toThrow(
      'at most 128',
    );
  });

  test('demotes an administrator and revokes sessions', async () => {
    const first = await createUser();
    const second = await createUser({
      email: 'second@example.com',
      password: 'password123',
      name: 'Second',
    });
    await makeAdmin(first.user.id);
    await makeAdmin(second.user.id);
    await demoteAdminAccount(second.user.email);
    expect((await db.user.findUnique({ where: { id: second.user.id } }))?.role).toBe('user');
    expect(await db.session.count({ where: { userId: second.user.id } })).toBe(0);
  });

  test('protects the last administrator and rejects missing targets', async () => {
    await expect(demoteAdminAccount('missing@example.com')).rejects.toThrow('No administrator');
    const created = await createUser();
    await makeAdmin(created.user.id);
    await expect(demoteAdminAccount(created.user.email)).rejects.toThrow('last administrator');
  });
});
