export * from './editor';

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

export const roleSchema = z.enum(['user', 'admin']).default('user');

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email().max(255),
  name: z.string().trim().min(1).max(255),
  role: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserSchema = userSchema.pick({
  email: true,
  name: true,
});

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string().email().max(255),
  name: z.string().trim().min(1).max(255),
  role: z.string().nullish(),
  banned: z.boolean(),
  banReason: z.string().nullish(),
  banExpires: z.date().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createAdminUserSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(255),
  name: z.string().trim().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: roleSchema,
});

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  isPersonal: z.boolean(),
  ownerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createProjectSchema = projectSchema.pick({
  name: true,
});

export const draftSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  projectId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createDraftSchema = draftSchema.pick({
  name: true,
});

export const updateDraftSchema = draftSchema.pick({
  name: true,
});

export const sortSchema = z
  .enum(['last_edited', 'last_created', 'alphabetical'])
  .default('last_edited');

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortablePaginationSchema = paginationSchema.extend({
  sort: sortSchema.optional(),
});
