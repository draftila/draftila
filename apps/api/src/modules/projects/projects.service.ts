import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { project } from '../../db/schema';
import { nanoid } from '../../common/lib/utils';

export async function listByOwner(userId: string) {
  return db.select().from(project).where(eq(project.ownerId, userId));
}

export async function getById(id: string) {
  const [result] = await db.select().from(project).where(eq(project.id, id));
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

export async function remove(id: string) {
  await db.delete(project).where(eq(project.id, id));
}
