import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder } from '@draftila/shared';
import { ForbiddenError } from '../../common/errors';
import { generateStorageKey, getStorage } from '../../common/lib/storage';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

export function userAccessFilter(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };
}

let lastTimestamp = 0;

function nextTimestamp() {
  const now = Date.now();
  if (now <= lastTimestamp) {
    lastTimestamp += 1;
  } else {
    lastTimestamp = now;
  }
  return new Date(lastTimestamp);
}

type ProjectSortConfig = {
  orderBy: Prisma.ProjectOrderByWithRelationInput[];
  where: (cursorProject: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }) => Prisma.ProjectWhereInput;
};

function getSortConfig(sort: SortOrder): ProjectSortConfig {
  switch (sort) {
    case 'alphabetical':
      return {
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        where: (cursorProject) => ({
          OR: [
            { name: { gt: cursorProject.name } },
            { name: cursorProject.name, id: { gt: cursorProject.id } },
          ],
        }),
      };
    case 'last_created':
      return {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: (cursorProject) => ({
          OR: [
            { createdAt: { lt: cursorProject.createdAt } },
            { createdAt: cursorProject.createdAt, id: { lt: cursorProject.id } },
          ],
        }),
      };
    case 'last_edited':
    default:
      return {
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        where: (cursorProject) => ({
          OR: [
            { updatedAt: { lt: cursorProject.updatedAt } },
            { updatedAt: cursorProject.updatedAt, id: { lt: cursorProject.id } },
          ],
        }),
      };
  }
}

export async function listByOwner(
  userId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  const accessFilter = userAccessFilter(userId);

  let cursorFilter: Prisma.ProjectWhereInput | undefined;
  if (cursor) {
    const cursorProject = await db.project.findFirst({
      where: { id: cursor, ...accessFilter },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorProject) {
      cursorFilter = sortConfig.where(cursorProject);
    }
  }

  const where: Prisma.ProjectWhereInput = cursorFilter
    ? {
        ...accessFilter,
        AND: [cursorFilter],
      }
    : accessFilter;

  const results = await db.project.findMany({
    where,
    orderBy: sortConfig.orderBy,
    take: limit + 1,
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;

  return { data, nextCursor };
}

export function getByIdForUser(id: string, userId: string) {
  return db.project.findFirst({
    where: { id, ...userAccessFilter(userId) },
  });
}

export function create(data: { name: string; ownerId: string }) {
  const timestamp = nextTimestamp();
  return db.project.create({
    data: {
      id: nanoid(),
      name: data.name,
      ownerId: data.ownerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
}

export async function update(id: string, data: { name?: string }) {
  const timestamp = nextTimestamp();
  const result = await db.project.updateMany({
    where: { id },
    data: { ...data, updatedAt: timestamp },
  });

  if (result.count === 0) return null;
  return db.project.findUnique({ where: { id } });
}

export async function saveLogo(id: string, data: Buffer) {
  const storage = getStorage();

  const existing = await db.project.findUnique({
    where: { id },
    select: { logo: true },
  });
  if (existing?.logo) {
    const oldKey = existing.logo.replace(/^\/storage\//, '');
    await storage.delete(oldKey).catch(() => {});
  }

  const key = generateStorageKey('logos', 'jpg');
  const url = await storage.put(key, data);

  await db.project.updateMany({
    where: { id },
    data: { logo: url },
  });

  return url;
}

export async function remove(id: string, ownerId: string) {
  const existing = await db.project.findFirst({ where: { id, ownerId } });
  if (!existing) return null;

  if (existing.isPersonal) {
    throw new ForbiddenError();
  }

  if (existing.logo) {
    const key = existing.logo.replace(/^\/storage\//, '');
    await getStorage()
      .delete(key)
      .catch(() => {});
  }

  await db.project.delete({ where: { id: existing.id } });
  return existing;
}
