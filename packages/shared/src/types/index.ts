export * from './editor';

import type { z } from 'zod';
import type {
  loginSchema,
  userSchema,
  createUserSchema,
  adminUserSchema,
  createAdminUserSchema,
  updateAdminUserSchema,
  projectSchema,
  createProjectSchema,
  updateProjectSchema,
  projectMemberRoleSchema,
  projectMemberSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  draftSchema,
  createDraftSchema,
  updateDraftSchema,
  commentSchema,
  commentAuthorSchema,
  commentResponseSchema,
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
  markAllCommentsReadSchema,
  paginationSchema,
  sortSchema,
} from '../schemas';

export type Login = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type CreateAdminUser = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUser = z.infer<typeof updateAdminUserSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type InviteMember = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type UpdateDraft = z.infer<typeof updateDraftSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;
export type CommentResponse = z.infer<typeof commentResponseSchema>;
export type CreateComment = z.infer<typeof createCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type MarkAllCommentsRead = z.infer<typeof markAllCommentsReadSchema>;
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
