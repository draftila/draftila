export * from './editor';

import type { z } from 'zod';
import type {
  loginSchema,
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
  commentResponseSchema,
  createCommentSchema,
  updateCommentSchema,
  markAllCommentsReadSchema,
  sortSchema,
  exportDraftDataSchema,
  draftExportSchema,
  snapshotWithAuthorSchema,
  createSnapshotSchema,
  updateSnapshotSchema,
  createApiKeySchema,
} from '../schemas';

export type Login = z.infer<typeof loginSchema>;
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
export type CommentResponse = z.infer<typeof commentResponseSchema>;
export type CreateComment = z.infer<typeof createCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type MarkAllCommentsRead = z.infer<typeof markAllCommentsReadSchema>;
export type SortOrder = z.infer<typeof sortSchema>;
export type ExportDraftData = z.infer<typeof exportDraftDataSchema>;
export type DraftExport = z.infer<typeof draftExportSchema>;
export type SnapshotWithAuthor = z.infer<typeof snapshotWithAuthorSchema>;
export type CreateSnapshot = z.infer<typeof createSnapshotSchema>;
export type UpdateSnapshot = z.infer<typeof updateSnapshotSchema>;
export type CreateApiKey = z.infer<typeof createApiKeySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorResponse {
  error: string;
  fieldErrors?: Record<string, string[]>;
}
