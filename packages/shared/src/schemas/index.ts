export * from './editor';

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  logo: z.string().nullable(),
  isPersonal: z.boolean(),
  ownerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createProjectSchema = projectSchema.pick({
  name: true,
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255).optional(),
});

export const projectMemberRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);

export const projectMemberSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  role: projectMemberRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(255),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
});

export const draftSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  projectId: z.string(),
  thumbnail: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createDraftSchema = draftSchema.pick({
  name: true,
});

export const updateDraftSchema = draftSchema.pick({
  name: true,
});

export const commentSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  pageId: z.string(),
  userId: z.string(),
  content: z.string().trim().min(1).max(5000),
  parentId: z.string().nullable(),
  resolved: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const commentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable().optional(),
});

export interface CommentResponseSchemaValue extends z.infer<typeof commentSchema> {
  author: z.infer<typeof commentAuthorSchema>;
  unread: boolean;
  replies: CommentResponseSchemaValue[];
}

export const commentResponseSchema: z.ZodType<CommentResponseSchemaValue> = commentSchema.extend({
  author: commentAuthorSchema,
  unread: z.boolean(),
  replies: z.array(z.lazy((): z.ZodType<CommentResponseSchemaValue> => commentResponseSchema)),
}) as z.ZodType<CommentResponseSchemaValue>;

export const createCommentSchema = z.object({
  pageId: z.string().min(1),
  content: z.string().trim().min(1).max(5000),
  parentId: z.string().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const listCommentsQuerySchema = z.object({
  pageId: z.string().min(1),
});

export const markAllCommentsReadSchema = z.object({
  pageId: z.string().min(1),
});

export const sortSchema = z
  .enum(['last_edited', 'last_created', 'alphabetical'])
  .default('last_edited');

export const exportPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  backgroundColor: z.string(),
  shapes: z.array(z.record(z.string(), z.unknown())),
  zOrder: z.array(z.string()),
});

export const exportVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('color'),
  value: z.string(),
});

const exportComponentShapesSchema = z.string().refine((value) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
    );
  } catch {
    return false;
  }
}, 'Invalid component shapes JSON');

export const exportComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  shapes: exportComponentShapesSchema,
});

export const exportDraftDataSchema = z.object({
  name: z.string().min(1).max(255),
  pages: z.array(exportPageSchema).min(1),
  pageOrder: z.array(z.string()).min(1),
  variables: z.array(exportVariableSchema).default([]),
  components: z.array(exportComponentSchema).default([]),
  componentInstances: z.record(z.string(), z.string()).default({}),
});

export const draftExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  generator: z.literal('draftila'),
  draft: exportDraftDataSchema,
});

export const importDraftSchema = draftExportSchema;

const snapshotSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  userId: z.string().nullable(),
  name: z.string().nullable(),
  createdAt: z.date(),
});

const snapshotAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const snapshotWithAuthorSchema = snapshotSchema.extend({
  author: snapshotAuthorSchema.nullable(),
});

export const createSnapshotSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
});

export const updateSnapshotSchema = z.object({
  name: z.union([z.string().trim().min(1, 'Name is required').max(255), z.null()]),
});

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Untitled';
}

const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortablePaginationSchema = paginationSchema.extend({
  sort: sortSchema.optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});
