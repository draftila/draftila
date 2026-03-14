import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateDraft, Draft, PaginatedResponse, UpdateDraft } from '@draftila/shared';
import { api } from '@/lib/api-client';

const DRAFTS_KEY = ['drafts'] as const;

export function useDrafts(projectId: string, cursor?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const base = `/api/projects/${projectId}/drafts`;
  const url = query ? `${base}?${query}` : base;

  return useQuery({
    queryKey: [...DRAFTS_KEY, projectId, { cursor, limit }],
    queryFn: () => api.get<PaginatedResponse<Draft>>(url),
  });
}

export function useDraft(projectId: string, draftId: string) {
  return useQuery({
    queryKey: [...DRAFTS_KEY, projectId, draftId],
    queryFn: () => api.get<Draft>(`/api/projects/${projectId}/drafts/${draftId}`),
  });
}

export function useCreateDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDraft) => api.post<Draft>(`/api/projects/${projectId}/drafts`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] }),
  });
}

export function useUpdateDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, data }: { draftId: string; data: UpdateDraft }) =>
      api.patch<Draft>(`/api/projects/${projectId}/drafts/${draftId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] }),
  });
}

export function useDeleteDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      api.delete<{ ok: true }>(`/api/projects/${projectId}/drafts/${draftId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] }),
  });
}
