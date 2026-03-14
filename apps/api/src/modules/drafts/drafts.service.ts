import { and, asc, desc, eq, sql, SQL } from 'drizzle-orm';
import type { SortOrder } from '@draftila/shared';
import { db } from '../../db';
import { draft, project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

function getSortConfig(sort: SortOrder) {
  switch (sort) {
    case 'alphabetical':
      return {
        orderBy: [asc(draft.name), asc(draft.id)],
        cursorSql: (cursor: string) =>
          sql`(${draft.name}, ${draft.id}) > (SELECT ${draft.name}, ${draft.id} FROM ${draft} WHERE ${draft.id} = ${cursor})`,
      };
    case 'last_created':
      return {
        orderBy: [desc(draft.createdAt), desc(draft.id)],
        cursorSql: (cursor: string) =>
          sql`(${draft.createdAt}, ${draft.id}) < (SELECT ${draft.createdAt}, ${draft.id} FROM ${draft} WHERE ${draft.id} = ${cursor})`,
      };
    case 'last_edited':
    default:
      return {
        orderBy: [desc(draft.updatedAt), desc(draft.id)],
        cursorSql: (cursor: string) =>
          sql`(${draft.updatedAt}, ${draft.id}) < (SELECT ${draft.updatedAt}, ${draft.id} FROM ${draft} WHERE ${draft.id} = ${cursor})`,
      };
  }
}

export async function listByProject(
  projectId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const conditions: SQL[] = [eq(draft.projectId, projectId)];
  const sortConfig = getSortConfig(sort);

  if (cursor) {
    conditions.push(sortConfig.cursorSql(cursor));
  }

  const results = await db
    .select()
    .from(draft)
    .where(and(...conditions))
    .orderBy(...sortConfig.orderBy)
    .limit(limit + 1);

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

  const conditions: SQL[] = [eq(project.ownerId, ownerId)];

  if (cursor) {
    conditions.push(sortConfig.cursorSql(cursor));
  }

  const results = await db
    .select({
      id: draft.id,
      name: draft.name,
      projectId: draft.projectId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    })
    .from(draft)
    .innerJoin(project, eq(draft.projectId, project.id))
    .where(and(...conditions))
    .orderBy(...sortConfig.orderBy)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;

  return { data, nextCursor };
}

export async function getById(id: string) {
  const [result] = await db.select().from(draft).where(eq(draft.id, id));
  return result ?? null;
}

export async function create(data: { name: string; projectId: string }) {
  const [created] = await db
    .insert(draft)
    .values({
      id: nanoid(),
      name: data.name,
      projectId: data.projectId,
    })
    .returning();

  if (!created) throw new Error('Failed to create draft');
  return created;
}

export async function update(id: string, data: { name: string }) {
  const [updated] = await db
    .update(draft)
    .set({ name: data.name, updatedAt: sql`now()` })
    .where(eq(draft.id, id))
    .returning();

  return updated ?? null;
}

export async function remove(id: string) {
  const [deleted] = await db.delete(draft).where(eq(draft.id, id)).returning();
  return deleted ?? null;
}

export async function verifyProjectOwnership(projectId: string, ownerId: string) {
  const [result] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)));
  return result ?? null;
}
