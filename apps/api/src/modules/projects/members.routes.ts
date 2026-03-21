import { Hono } from 'hono';
import { inviteMemberSchema, updateMemberRoleSchema } from '@draftila/shared';
import { NotFoundError, ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as membersService from './members.service';

const memberRoutes = new Hono<AuthEnv>();

memberRoutes.use(requireAuth);

memberRoutes.get('/', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await membersService.getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const members = await membersService.listByProject(projectId);
  return c.json({ data: members });
});

memberRoutes.post('/', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const body = await c.req.json();
  const parsed = inviteMemberSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const member = await membersService.invite(
    projectId,
    parsed.data.email,
    parsed.data.role,
    user.id,
  );
  return c.json(member, 201);
});

memberRoutes.patch('/:memberId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const memberId = c.req.param('memberId');

  const body = await c.req.json();
  const parsed = updateMemberRoleSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const member = await membersService.updateRole(projectId, memberId, parsed.data.role, user.id);
  return c.json(member);
});

memberRoutes.delete('/:memberId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const memberId = c.req.param('memberId');

  await membersService.removeMember(projectId, memberId, user.id);
  return c.json({ ok: true });
});

export { memberRoutes };
