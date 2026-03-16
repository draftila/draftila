import { and, asc, desc, eq, sql, SQL } from 'drizzle-orm';
import type { SortOrder } from '@draftila/shared';
import { ForbiddenError } from '../../common/errors';
import { db } from '../../db';
import { project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

function getSortConfig(sort: SortOrder) {
  switch (sort) {
    case 'alphabetical':
      return {
        orderBy: [asc(project.name), asc(project.id)],
        cursorSql: (cursor: string) =>
          sql`(${project.name}, ${project.id}) > (SELECT ${project.name}, ${project.id} FROM ${project} WHERE ${project.id} = ${cursor})`,
      };
    case 'last_created':
      return {
        orderBy: [desc(project.createdAt), desc(project.id)],
        cursorSql: (cursor: string) =>
          sql`(${project.createdAt}, ${project.id}) < (SELECT ${project.createdAt}, ${project.id} FROM ${project} WHERE ${project.id} = ${cursor})`,
      };
    case 'last_edited':
    default:
      return {
        orderBy: [desc(project.updatedAt), desc(project.id)],
        cursorSql: (cursor: string) =>
          sql`(${project.updatedAt}, ${project.id}) < (SELECT ${project.updatedAt}, ${project.id} FROM ${project} WHERE ${project.id} = ${cursor})`,
      };
  }
}

export async function listByOwner(
  userId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const conditions: SQL[] = [eq(project.ownerId, userId)];
  const sortConfig = getSortConfig(sort);

  if (cursor) {
    conditions.push(sortConfig.cursorSql(cursor));
  }

  const results = await db
    .select()
    .from(project)
    .where(and(...conditions))
    .orderBy(...sortConfig.orderBy)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.id : null;

  return { data, nextCursor };
}

export async function getByIdAndOwner(id: string, ownerId: string) {
  const [result] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.ownerId, ownerId)));
  return result ?? null;
}

export async function create(data: { name: string; ownerId: string }) {
  const [created] = await db
    .insert(project)
    .values({
      id: nanoid(),
      name: data.name,
      ownerId: data.ownerId,
    })
    .returning();

  if (!created) throw new Error('Failed to create project');
  return created;
}

export async function remove(id: string, ownerId: string) {
  const existing = await getByIdAndOwner(id, ownerId);
  if (!existing) return null;

  if (existing.isPersonal) {
    throw new ForbiddenError();
  }

  const [deleted] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.ownerId, ownerId)))
    .returning();
  return deleted ?? null;
}
