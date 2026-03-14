import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    isPersonal: boolean('is_personal').notNull().default(false),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('project_owner_id_idx').on(table.ownerId)],
);
