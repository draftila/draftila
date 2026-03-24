import { db } from '../../db';
import { nanoid } from '../../common/lib/utils';

const API_KEY_PREFIX = 'dk_';
const MAX_KEYS_PER_USER = 20;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function create(userId: string, name: string) {
  const existingCount = await db.apiKey.count({ where: { userId } });
  if (existingCount >= MAX_KEYS_PER_USER) {
    throw new Error(`Maximum of ${MAX_KEYS_PER_USER} API keys per user`);
  }

  const rawKey = `${API_KEY_PREFIX}${nanoid(40)}`;
  const keyHash = await sha256Hex(rawKey);
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

  const keyHash = await sha256Hex(rawKey);
  const key = await db.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true },
  });

  if (!key) return null;

  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { userId: key.userId };
}
