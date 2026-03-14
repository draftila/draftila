import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

export async function listByOwner(userId: string) {
  return db.select().from(project).where(eq(project.ownerId, userId));
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

  return created!;
}

export async function remove(id: string, ownerId: string) {
  const [deleted] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.ownerId, ownerId)))
    .returning();
  return deleted ?? null;
}
