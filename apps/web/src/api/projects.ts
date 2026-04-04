import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProject,
  InviteMember,
  PaginatedResponse,
  Project,
  ProjectMember,
  SortOrder,
  UpdateMemberRole,
  UpdateProject,
} from '@draftila/shared';
import { api } from '@/lib/api-client';

const PROJECTS_KEY = ['projects'] as const;
const MEMBERS_KEY = ['project-members'] as const;

interface UseProjectsOptions {
  cursor?: string;
  limit?: number;
  sort?: SortOrder;
}

export function useProjects(options: UseProjectsOptions = {}) {
  const { cursor, limit, sort } = options;
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  const query = params.toString();
  const url = query ? `/api/projects?${query}` : '/api/projects';

  return useQuery({
    queryKey: [...PROJECTS_KEY, { cursor, limit, sort }],
    queryFn: () => api.get<PaginatedResponse<Project>>(url),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, id],
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProject) => api.post<Project>('/api/projects', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProject }) =>
      api.patch<Project>(`/api/projects/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUploadProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api.upload<{ url: string }>(`/api/projects/${id}/logo`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: [...MEMBERS_KEY, projectId],
    queryFn: () => api.get<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: InviteMember }) =>
      api.post<ProjectMember>(`/api/projects/${projectId}/members`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      memberId,
      data,
    }: {
      projectId: string;
      memberId: string;
      data: UpdateMemberRole;
    }) => api.patch<ProjectMember>(`/api/projects/${projectId}/members/${memberId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memberId }: { projectId: string; memberId: string }) =>
      api.delete<{ ok: true }>(`/api/projects/${projectId}/members/${memberId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
  });
}
