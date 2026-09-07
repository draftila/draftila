import type { ProjectMemberRole } from '@draftila/shared';

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
