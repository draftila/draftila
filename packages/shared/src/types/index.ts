import type { z } from 'zod';
import type {
  loginSchema,
  userSchema,
  createUserSchema,
  projectSchema,
  createProjectSchema,
} from '../schemas';

export type Login = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;

export interface ApiErrorResponse {
  error: string;
  fieldErrors?: Record<string, string[]>;
}
