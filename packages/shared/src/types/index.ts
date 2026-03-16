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
  mcpTokenScopeSchema,
  mcpTokenSchema,
  createMcpTokenSchema,
  createMcpTokenResponseSchema,
  mcpCanvasOpDirectionSchema,
  mcpCanvasOpSchema,
  mcpCanvasApplyOpsSchema,
  mcpRpcRequestSchema,
  mcpRpcResponseSchema,
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
export type McpTokenScope = z.infer<typeof mcpTokenScopeSchema>;
export type McpToken = z.infer<typeof mcpTokenSchema>;
export type CreateMcpToken = z.infer<typeof createMcpTokenSchema>;
export type CreateMcpTokenResponse = z.infer<typeof createMcpTokenResponseSchema>;
export type McpCanvasOpDirection = z.infer<typeof mcpCanvasOpDirectionSchema>;
export type McpCanvasOp = z.infer<typeof mcpCanvasOpSchema>;
export type McpCanvasApplyOps = z.infer<typeof mcpCanvasApplyOpsSchema>;
export type McpRpcRequest = z.infer<typeof mcpRpcRequestSchema>;
export type McpRpcResponse = z.infer<typeof mcpRpcResponseSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorResponse {
  error: string;
  fieldErrors?: Record<string, string[]>;
}
