import type { SortOrder } from '@draftila/shared';

type CursorItem = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type WhereFilter = Record<string, unknown>;

type SortConfig = {
  orderBy: Record<string, 'asc' | 'desc'>[];
  where: (cursorItem: CursorItem) => WhereFilter;
};

export function getSortConfig(sort: SortOrder): SortConfig {
  switch (sort) {
    case 'alphabetical':
      return {
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        where: (cursorItem) => ({
          OR: [
            { name: { gt: cursorItem.name } },
            { name: cursorItem.name, id: { gt: cursorItem.id } },
          ],
        }),
      };
    case 'last_created':
      return {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: (cursorItem) => ({
          OR: [
            { createdAt: { lt: cursorItem.createdAt } },
            { createdAt: cursorItem.createdAt, id: { lt: cursorItem.id } },
          ],
        }),
      };
    case 'last_edited':
    default:
      return {
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        where: (cursorItem) => ({
          OR: [
            { updatedAt: { lt: cursorItem.updatedAt } },
            { updatedAt: cursorItem.updatedAt, id: { lt: cursorItem.id } },
          ],
        }),
      };
  }
}

let lastTimestamp = 0;

export function nextTimestamp() {
  const now = Date.now();
  if (now <= lastTimestamp) {
    lastTimestamp += 1;
  } else {
    lastTimestamp = now;
  }
  return new Date(lastTimestamp);
}

export function paginateResults<T extends { id: string }>(
  results: T[],
  limit: number,
): { data: T[]; nextCursor: string | null } {
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;
  return { data, nextCursor };
}
