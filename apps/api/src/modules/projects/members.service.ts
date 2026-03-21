import type { ProjectMemberRole } from '@draftila/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

const memberWithUser = {
  id: true,
  projectId: true,
  userId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

export function listByProject(projectId: string) {
  return db.projectMember.findMany({
    where: { projectId },
    select: memberWithUser,
    orderBy: { createdAt: 'asc' },
  });
}

export async function invite(
  projectId: string,
  email: string,
  role: 'admin' | 'editor' | 'viewer',
  actorId: string,
) {
  const actorMembership = await getEffectiveMembership(projectId, actorId);
  if (!actorMembership || !canInvite(actorMembership.role)) {
    throw new ForbiddenError();
  }

  const targetUser = await db.user.findUnique({ where: { email } });
  if (!targetUser) {
    throw new NotFoundError('User');
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (project?.ownerId === targetUser.id) {
    throw new ConflictError('User is already the project owner');
  }

  const existing = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUser.id } },
  });
  if (existing) {
    throw new ConflictError('User is already a member of this project');
  }

  return db.projectMember.create({
    data: {
      id: nanoid(),
      projectId,
      userId: targetUser.id,
      role,
    },
    select: memberWithUser,
  });
}

export async function updateRole(
  projectId: string,
  memberId: string,
  role: 'admin' | 'editor' | 'viewer',
  actorId: string,
) {
  const actorMembership = await getEffectiveMembership(projectId, actorId);
  if (!actorMembership || !canManageMembers(actorMembership.role)) {
    throw new ForbiddenError();
  }

  const member = await db.projectMember.findFirst({
    where: { id: memberId, projectId },
  });
  if (!member) {
    throw new NotFoundError('Member');
  }

  if (member.userId === actorId) {
    throw new ForbiddenError();
  }

  if (member.role === 'owner') {
    throw new ForbiddenError();
  }

  if (actorMembership.role === 'admin' && member.role === 'admin') {
    throw new ForbiddenError();
  }

  return db.projectMember.update({
    where: { id: memberId },
    data: { role },
    select: memberWithUser,
  });
}

export async function removeMember(projectId: string, memberId: string, actorId: string) {
  const actorMembership = await getEffectiveMembership(projectId, actorId);
  if (!actorMembership || !canManageMembers(actorMembership.role)) {
    throw new ForbiddenError();
  }

  const member = await db.projectMember.findFirst({
    where: { id: memberId, projectId },
  });
  if (!member) {
    throw new NotFoundError('Member');
  }

  if (member.userId === actorId) {
    throw new ForbiddenError();
  }

  if (member.role === 'owner') {
    throw new ForbiddenError();
  }

  if (actorMembership.role === 'admin' && member.role === 'admin') {
    throw new ForbiddenError();
  }

  await db.projectMember.delete({ where: { id: memberId } });
  return member;
}

export async function getEffectiveMembership(
  projectId: string,
  userId: string,
): Promise<{ role: ProjectMemberRole; userId: string; projectId: string } | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (project?.ownerId === userId) {
    return { role: 'owner', userId, projectId };
  }

  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true, userId: true, projectId: true },
  });

  if (!membership) return null;

  return {
    role: membership.role as ProjectMemberRole,
    userId: membership.userId,
    projectId: membership.projectId,
  };
}

export function canInvite(role: ProjectMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManageMembers(role: ProjectMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canEdit(role: ProjectMemberRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canDelete(role: ProjectMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}
