export * from './editor';

import type { z } from 'zod';
import type {
  loginSchema,
  userSchema,
  createUserSchema,
  projectSchema,
  createProjectSchema,
  draftSchema,
  createDraftSchema,
  updateDraftSchema,
  paginationSchema,
  sortSchema,
} from '../schemas';

export type Login = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type UpdateDraft = z.infer<typeof updateDraftSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type SortOrder = z.infer<typeof sortSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorResponse {
  error: string;
  fieldErrors?: Record<string, string[]>;
}
