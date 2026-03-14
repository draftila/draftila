import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { project } from './project';

export const draft = pgTable(
  'draft',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('draft_project_id_idx').on(table.projectId)],
);
