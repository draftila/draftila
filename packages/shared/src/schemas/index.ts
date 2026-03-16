export * from './editor';

import { z } from 'zod';
import { shapeTypeSchema } from './editor';

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

export const mcpTokenScopeSchema = z.enum([
  'mcp:projects:read',
  'mcp:drafts:read',
  'mcp:canvas:read',
  'mcp:canvas:write',
]);

export const mcpTokenSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  scopes: z.array(mcpTokenScopeSchema).min(1),
  projectIds: z.array(z.string()).nullable(),
  draftIds: z.array(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
});

export const createMcpTokenSchema = z.object({
  name: z.string().trim().min(1).max(255),
  scopes: z.array(mcpTokenScopeSchema).min(1),
  projectIds: z.array(z.string()).optional(),
  draftIds: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const createMcpTokenResponseSchema = z.object({
  token: mcpTokenSchema,
  secret: z.string(),
});

export const mcpCanvasOpDirectionSchema = z.enum(['forward', 'backward', 'front', 'back']);

export const mcpCanvasAddShapeOpSchema = z.object({
  type: z.literal('add_shape'),
  shapeType: shapeTypeSchema,
  ref: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  props: z.record(z.unknown()).optional(),
});

export const mcpCanvasUpdateShapeOpSchema = z.object({
  type: z.literal('update_shape'),
  id: z.string(),
  props: z.record(z.unknown()),
});

export const mcpCanvasDeleteShapesOpSchema = z.object({
  type: z.literal('delete_shapes'),
  ids: z.array(z.string()).min(1),
});

export const mcpCanvasMoveStackOpSchema = z.object({
  type: z.literal('move_stack'),
  ids: z.array(z.string()).min(1),
  direction: mcpCanvasOpDirectionSchema,
});

export const mcpCanvasGroupShapesOpSchema = z.object({
  type: z.literal('group_shapes'),
  ids: z.array(z.string()).min(2),
});

export const mcpCanvasUngroupShapesOpSchema = z.object({
  type: z.literal('ungroup_shapes'),
  ids: z.array(z.string()).min(1),
});

export const mcpCanvasDuplicateShapesOpSchema = z.object({
  type: z.literal('duplicate_shapes'),
  ids: z.array(z.string()).min(1).max(100),
  offset: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  refs: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/),
    )
    .min(1)
    .max(100)
    .optional(),
});

export const mcpCanvasOpSchema = z.discriminatedUnion('type', [
  mcpCanvasAddShapeOpSchema,
  mcpCanvasUpdateShapeOpSchema,
  mcpCanvasDeleteShapesOpSchema,
  mcpCanvasMoveStackOpSchema,
  mcpCanvasGroupShapesOpSchema,
  mcpCanvasUngroupShapesOpSchema,
  mcpCanvasDuplicateShapesOpSchema,
]);

export const mcpCanvasApplyOpsSchema = z.object({
  draftId: z.string(),
  ops: z.array(mcpCanvasOpSchema).min(1).max(200),
});

export const mcpRpcRequestSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()),
});

export const mcpRpcResponseSchema = z.object({
  id: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
