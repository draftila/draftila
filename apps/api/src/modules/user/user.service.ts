import { db } from '../../db';

export async function getById(id: string) {
  return db.user.findUnique({ where: { id } });
}
