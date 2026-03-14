import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProject, PaginatedResponse, Project } from '@draftila/shared';
import { api } from '@/lib/api-client';

const PROJECTS_KEY = ['projects'] as const;

export function useProjects(cursor?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const url = query ? `/api/projects?${query}` : '/api/projects';

  return useQuery({
    queryKey: [...PROJECTS_KEY, { cursor, limit }],
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

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}
