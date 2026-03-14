import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { draft, project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

export async function listByProject(projectId: string, cursor?: string, limit = 20) {
  const conditions: SQL[] = [eq(draft.projectId, projectId)];

  if (cursor) {
    conditions.push(
      sql`(${draft.createdAt}, ${draft.id}) < (SELECT ${draft.createdAt}, ${draft.id} FROM ${draft} WHERE ${draft.id} = ${cursor})`,
    );
  }

  const results = await db
    .select()
    .from(draft)
    .where(and(...conditions))
    .orderBy(desc(draft.createdAt), desc(draft.id))
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
    .set({ name: data.name })
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
