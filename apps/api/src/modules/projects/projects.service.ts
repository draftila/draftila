import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder } from '@draftila/shared';
import { ForbiddenError } from '../../common/errors';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

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

  let cursorFilter: Prisma.ProjectWhereInput | undefined;
  if (cursor) {
    const cursorProject = await db.project.findFirst({
      where: { id: cursor, ownerId: userId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorProject) {
      cursorFilter = sortConfig.where(cursorProject);
    }
  }

  const where: Prisma.ProjectWhereInput = cursorFilter
    ? {
        ownerId: userId,
        AND: [cursorFilter],
      }
    : { ownerId: userId };

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

export function getByIdAndOwner(id: string, ownerId: string) {
  return db.project.findFirst({ where: { id, ownerId } });
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

export async function remove(id: string, ownerId: string) {
  const existing = await getByIdAndOwner(id, ownerId);
  if (!existing) return null;

  if (existing.isPersonal) {
    throw new ForbiddenError();
  }

  await db.project.delete({ where: { id: existing.id } });
  return existing;
}
