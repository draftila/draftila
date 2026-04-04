import {
  createCommentSchema,
  listCommentsQuerySchema,
  markAllCommentsReadSchema,
  updateCommentSchema,
} from '@draftila/shared';
import { Hono } from 'hono';
import { validateOrThrow } from '../../common/lib/validation';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as commentsService from './comments.service';

type CommentsEnv = AuthEnv & { Variables: AuthEnv['Variables'] };

const draftCommentsRoutes = new Hono<CommentsEnv>();
const commentRoutes = new Hono<CommentsEnv>();

draftCommentsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const parsed = validateOrThrow(listCommentsQuerySchema, {
    pageId: c.req.query('pageId'),
  });

  const comments = await commentsService.listByDraft(draftId, parsed.pageId, user.id);
  return c.json(comments);
});

draftCommentsRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const body = await c.req.json();
  const parsed = validateOrThrow(createCommentSchema, body);

  const created = await commentsService.create(draftId, user.id, parsed);
  return c.json(created, 201);
});

draftCommentsRoutes.post('/read-all', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  const body = await c.req.json();
  const parsed = validateOrThrow(markAllCommentsReadSchema, body);

  const result = await commentsService.markAllRead(draftId, parsed.pageId, user.id);
  return c.json(result);
});

commentRoutes.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const body = await c.req.json();
  const parsed = validateOrThrow(updateCommentSchema, body);

  const updated = await commentsService.update(commentId, user.id, parsed);
  return c.json(updated);
});

commentRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const result = await commentsService.remove(commentId, user.id);
  return c.json(result);
});

commentRoutes.post('/:id/resolve', requireAuth, async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const updated = await commentsService.toggleResolved(commentId, user.id);
  return c.json(updated);
});

commentRoutes.post('/:id/read', requireAuth, async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  const result = await commentsService.markThreadRead(commentId, user.id);
  return c.json(result);
});

export { draftCommentsRoutes, commentRoutes };
