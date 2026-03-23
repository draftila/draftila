import { db } from '../../db';
import { nanoid } from '../../common/lib/utils';

const API_KEY_PREFIX = 'dk_';

export async function create(userId: string, name: string) {
  const rawKey = `${API_KEY_PREFIX}${nanoid(40)}`;
  const keyHash = await Bun.password.hash(rawKey);
  const id = nanoid();

  await db.apiKey.create({
    data: { id, name, keyHash, userId },
  });

  return { id, name, key: rawKey };
}

export async function listByUser(userId: string) {
  return db.apiKey.findMany({
    where: { userId },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function remove(id: string, userId: string) {
  const existing = await db.apiKey.findFirst({ where: { id, userId } });
  if (!existing) return null;
  await db.apiKey.delete({ where: { id } });
  return existing;
}

export async function verifyKey(rawKey: string) {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const keys = await db.apiKey.findMany({
    select: { id: true, keyHash: true, userId: true },
  });

  for (const key of keys) {
    const matches = await Bun.password.verify(rawKey, key.keyHash);
    if (matches) {
      db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return { userId: key.userId };
    }
  }

  return null;
}
