import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder } from '@draftila/shared';
import { generateStorageKey, getStorage } from '../../common/lib/storage';
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

const draftListSelect = {
  id: true,
  name: true,
  projectId: true,
  thumbnail: true,
  createdAt: true,
  updatedAt: true,
} as const;

type DraftSortConfig = {
  orderBy: Prisma.DraftOrderByWithRelationInput[];
  where: (cursorDraft: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }) => Prisma.DraftWhereInput;
};

function getSortConfig(sort: SortOrder): DraftSortConfig {
  switch (sort) {
    case 'alphabetical':
      return {
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        where: (cursorDraft) => ({
          OR: [
            { name: { gt: cursorDraft.name } },
            { name: cursorDraft.name, id: { gt: cursorDraft.id } },
          ],
        }),
      };
    case 'last_created':
      return {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: (cursorDraft) => ({
          OR: [
            { createdAt: { lt: cursorDraft.createdAt } },
            { createdAt: cursorDraft.createdAt, id: { lt: cursorDraft.id } },
          ],
        }),
      };
    case 'last_edited':
    default:
      return {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        where: (cursorDraft) => ({
          OR: [
            { updatedAt: { lt: cursorDraft.updatedAt } },
            {
              updatedAt: cursorDraft.updatedAt,
              createdAt: { lt: cursorDraft.createdAt },
            },
            {
              updatedAt: cursorDraft.updatedAt,
              createdAt: cursorDraft.createdAt,
              id: { lt: cursorDraft.id },
            },
          ],
        }),
      };
  }
}

export async function listByProject(
  projectId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  let cursorFilter: Prisma.DraftWhereInput | undefined;
  if (cursor) {
    const cursorDraft = await db.draft.findFirst({
      where: { id: cursor, projectId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorDraft) {
      cursorFilter = sortConfig.where(cursorDraft);
    }
  }

  const where: Prisma.DraftWhereInput = cursorFilter
    ? {
        projectId,
        AND: [cursorFilter],
      }
    : { projectId };

  const results = await db.draft.findMany({
    where,
    select: draftListSelect,
    orderBy: sortConfig.orderBy,
    take: limit + 1,
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;

  return { data, nextCursor };
}

export async function listByOwner(
  ownerId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  let cursorFilter: Prisma.DraftWhereInput | undefined;
  if (cursor) {
    const cursorDraft = await db.draft.findFirst({
      where: { id: cursor, project: { ownerId } },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorDraft) {
      cursorFilter = sortConfig.where(cursorDraft);
    }
  }

  const where: Prisma.DraftWhereInput = cursorFilter
    ? {
        project: { ownerId },
        AND: [cursorFilter],
      }
    : { project: { ownerId } };

  const results = await db.draft.findMany({
    where,
    select: draftListSelect,
    orderBy: sortConfig.orderBy,
    take: limit + 1,
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;

  return { data, nextCursor };
}

export function getById(id: string) {
  return db.draft.findUnique({ where: { id }, select: draftListSelect });
}

export function getByIdForOwner(draftId: string, ownerId: string) {
  return db.draft.findFirst({
    where: { id: draftId, project: { ownerId } },
    select: draftListSelect,
  });
}

export async function create(data: { name: string; projectId: string }) {
  const id = nanoid();
  const timestamp = nextTimestamp();
  await db.draft.create({
    data: {
      id,
      name: data.name,
      projectId: data.projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  const created = await getById(id);
  if (!created) throw new Error('Failed to create draft');
  return created;
}

export async function update(id: string, data: { name: string }) {
  const timestamp = nextTimestamp();
  const result = await db.draft.updateMany({
    where: { id },
    data: { name: data.name, updatedAt: timestamp },
  });

  if (result.count === 0) return null;
  return getById(id);
}

export async function remove(id: string) {
  const existing = await getById(id);
  if (!existing) return null;

  if (existing.thumbnail) {
    const key = existing.thumbnail.replace(/^\/storage\//, '');
    await getStorage()
      .delete(key)
      .catch(() => {});
  }

  await db.draft.delete({ where: { id } });
  return existing;
}

export async function saveThumbnail(id: string, data: Buffer) {
  const storage = getStorage();

  const existing = await db.draft.findUnique({
    where: { id },
    select: { thumbnail: true },
  });
  if (existing?.thumbnail) {
    const oldKey = existing.thumbnail.replace(/^\/storage\//, '');
    await storage.delete(oldKey).catch(() => {});
  }

  const key = generateStorageKey('thumbnails', 'jpg');
  const url = await storage.put(key, data);

  await db.draft.updateMany({
    where: { id },
    data: { thumbnail: url },
  });

  return url;
}

export async function loadYjsState(id: string) {
  const result = await db.draft.findUnique({
    where: { id },
    select: { yjsState: true },
  });
  return result?.yjsState ?? null;
}

export async function saveYjsState(id: string, state: Buffer) {
  await db.draft.update({ where: { id }, data: { yjsState: new Uint8Array(state) } });
}

export function verifyProjectOwnership(projectId: string, ownerId: string) {
  return db.project.findFirst({ where: { id: projectId, ownerId } });
}
