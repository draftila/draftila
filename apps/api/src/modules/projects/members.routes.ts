import { Hono } from 'hono';
import { inviteMemberSchema, updateMemberRoleSchema } from '@draftila/shared';
import { NotFoundError } from '../../common/errors';
import { validateOrThrow } from '../../common/lib/validation';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as membersService from './members.service';

const memberRoutes = new Hono<AuthEnv>();

memberRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await membersService.getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const members = await membersService.listByProject(projectId);
  return c.json({ data: members });
});

memberRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const body = await c.req.json();
  const parsed = validateOrThrow(inviteMemberSchema, body);

  const member = await membersService.invite(projectId, parsed.email, parsed.role, user.id);
  return c.json(member, 201);
});

memberRoutes.patch('/:memberId', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const memberId = c.req.param('memberId');

  const body = await c.req.json();
  const parsed = validateOrThrow(updateMemberRoleSchema, body);

  const member = await membersService.updateRole(projectId, memberId, parsed.role, user.id);
  return c.json(member);
});

memberRoutes.delete('/:memberId', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const memberId = c.req.param('memberId');

  await membersService.removeMember(projectId, memberId, user.id);
  return c.json({ ok: true });
});

export { memberRoutes };
