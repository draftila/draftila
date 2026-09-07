import { projectMemberRoleSchema } from '@draftila/shared';
import { ForbiddenError, NotFoundError } from '../../common/errors';
import { db } from '../../db';
import { canDelete, canEdit } from '../projects/project-permissions';

export async function getDraftAccess(draftId: string, userId: string) {
  const draft = await db.draft.findUnique({
    where: { id: draftId },
    select: {
      projectId: true,
      project: {
        select: {
          ownerId: true,
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });
  if (!draft) return null;

  const role = projectMemberRoleSchema.safeParse(
    draft.project.ownerId === userId ? 'owner' : draft.project.members[0]?.role,
  );
  if (!role.success) return null;

  return {
    projectId: draft.projectId,
    role: role.data,
    canEdit: canEdit(role.data),
    canDelete: canDelete(role.data),
  };
}

export async function requireDraftAccess(
  draftId: string,
  userId: string,
  action: 'read' | 'edit' | 'delete' = 'read',
) {
  const access = await getDraftAccess(draftId, userId);
  if (!access) throw new NotFoundError('Draft');
  if ((action === 'edit' && !access.canEdit) || (action === 'delete' && !access.canDelete)) {
    throw new ForbiddenError();
  }
  return access;
}
