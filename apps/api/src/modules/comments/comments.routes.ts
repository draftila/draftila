import {
  createCommentSchema,
  listCommentsQuerySchema,
  markAllCommentsReadSchema,
  updateCommentSchema,
} from '@draftila/shared';
import { Hono } from 'hono';
import { ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as commentsService from './comments.service';

type CommentsEnv = AuthEnv & { Variables: AuthEnv['Variables'] };

const draftCommentsRoutes = new Hono<CommentsEnv>();
const commentRoutes = new Hono<CommentsEnv>();

draftCommentsRoutes.use(requireAuth);
commentRoutes.use(requireAuth);

draftCommentsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const parsed = listCommentsQuerySchema.safeParse({
    pageId: c.req.query('pageId'),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const comments = await commentsService.listByDraft(draftId, parsed.data.pageId, user.id);
  return c.json(comments);
});

draftCommentsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const body = await c.req.json();
  const parsed = createCommentSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const created = await commentsService.create(draftId, user.id, parsed.data);
  return c.json(created, 201);
});

draftCommentsRoutes.post('/read-all', async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const body = await c.req.json();
  const parsed = markAllCommentsReadSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const result = await commentsService.markAllRead(draftId, parsed.data.pageId, user.id);
  return c.json(result);
});

commentRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const body = await c.req.json();
  const parsed = updateCommentSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const updated = await commentsService.update(commentId, user.id, parsed.data);
  return c.json(updated);
});

commentRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const result = await commentsService.remove(commentId, user.id);
  return c.json(result);
});

commentRoutes.post('/:id/resolve', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const updated = await commentsService.toggleResolved(commentId, user.id);
  return c.json(updated);
});

commentRoutes.post('/:id/read', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const result = await commentsService.markThreadRead(commentId, user.id);
  return c.json(result);
});

export { draftCommentsRoutes, commentRoutes };
