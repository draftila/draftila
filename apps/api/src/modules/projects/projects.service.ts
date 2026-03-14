import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

export async function listByOwner(userId: string, cursor?: string, limit = 20) {
  const conditions: SQL[] = [eq(project.ownerId, userId)];

  if (cursor) {
    conditions.push(
      sql`(${project.createdAt}, ${project.id}) < (SELECT ${project.createdAt}, ${project.id} FROM ${project} WHERE ${project.id} = ${cursor})`,
    );
  }

  const results = await db
    .select()
    .from(project)
    .where(and(...conditions))
    .orderBy(desc(project.createdAt), desc(project.id))
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
  const [deleted] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.ownerId, ownerId)))
    .returning();
  return deleted ?? null;
}
