import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email().max(255),
  name: z.string().trim().min(1).max(255),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserSchema = userSchema.pick({
  email: true,
  name: true,
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  ownerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createProjectSchema = projectSchema.pick({
  name: true,
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
