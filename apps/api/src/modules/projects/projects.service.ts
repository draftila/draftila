import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder } from '@draftila/shared';
import { ForbiddenError } from '../../common/errors';
import { getSortConfig, nextTimestamp, paginateResults } from '../../common/lib/pagination';
import { extractStorageKey, getStorage, replaceStorageFile } from '../../common/lib/storage';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

export function userAccessFilter(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };
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
      cursorFilter = sortConfig.where(cursorProject) as Prisma.ProjectWhereInput;
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
    orderBy: sortConfig.orderBy as Prisma.ProjectOrderByWithRelationInput[],
    take: limit + 1,
  });

  return paginateResults(results, limit);
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
  const existing = await db.project.findUnique({
    where: { id },
    select: { logo: true },
  });

  const url = await replaceStorageFile('logos', 'jpg', data, existing?.logo);
  await db.project.updateMany({ where: { id }, data: { logo: url } });
  return url;
}

export async function remove(id: string, ownerId: string) {
  const existing = await db.project.findFirst({ where: { id, ownerId } });
  if (!existing) return null;

  if (existing.isPersonal) {
    throw new ForbiddenError();
  }

  if (existing.logo) {
    await getStorage()
      .delete(extractStorageKey(existing.logo))
      .catch(() => {});
  }

  await db.project.delete({ where: { id: existing.id } });
  return existing;
}
