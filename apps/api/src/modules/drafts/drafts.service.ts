import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder } from '@draftila/shared';
import { getSortConfig, nextTimestamp, paginateResults } from '../../common/lib/pagination';
import { generateStorageKey, getStorage } from '../../common/lib/storage';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';
import { userAccessFilter } from '../projects/projects.service';

const draftListSelect = {
  id: true,
  name: true,
  projectId: true,
  thumbnail: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
      cursorFilter = sortConfig.where(cursorDraft) as Prisma.DraftWhereInput;
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
    orderBy: sortConfig.orderBy as Prisma.DraftOrderByWithRelationInput[],
    take: limit + 1,
  });

  return paginateResults(results, limit);
}

export async function listByUser(
  userId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  const accessFilter: Prisma.DraftWhereInput = {
    project: userAccessFilter(userId),
  };

  let cursorFilter: Prisma.DraftWhereInput | undefined;
  if (cursor) {
    const cursorDraft = await db.draft.findFirst({
      where: { id: cursor, ...accessFilter },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorDraft) {
      cursorFilter = sortConfig.where(cursorDraft) as Prisma.DraftWhereInput;
    }
  }

  const where: Prisma.DraftWhereInput = cursorFilter
    ? {
        ...accessFilter,
        AND: [cursorFilter],
      }
    : accessFilter;

  const results = await db.draft.findMany({
    where,
    select: draftListSelect,
    orderBy: sortConfig.orderBy as Prisma.DraftOrderByWithRelationInput[],
    take: limit + 1,
  });

  return paginateResults(results, limit);
}

export function getById(id: string) {
  return db.draft.findUnique({ where: { id }, select: draftListSelect });
}

export function getByIdForUser(draftId: string, userId: string) {
  return db.draft.findFirst({
    where: { id: draftId, project: userAccessFilter(userId) },
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
