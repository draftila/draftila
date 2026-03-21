import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDraft,
  Draft,
  SortOrder,
  PaginatedResponse,
  UpdateDraft,
} from '@draftila/shared';
import { api } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';

const DRAFTS_KEY = ['drafts'] as const;

interface UseDraftsOptions {
  cursor?: string;
  limit?: number;
  sort?: SortOrder;
}

export function useDrafts(projectId: string, options: UseDraftsOptions = {}) {
  const { cursor, limit, sort } = options;
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  const query = params.toString();
  const base = `/api/projects/${projectId}/drafts`;
  const url = query ? `${base}?${query}` : base;

  return useQuery({
    queryKey: [...DRAFTS_KEY, projectId, { cursor, limit, sort }],
    queryFn: () => api.get<PaginatedResponse<Draft>>(url),
    enabled: !!projectId,
  });
}

export function useAllDrafts(options: UseDraftsOptions = {}) {
  const { cursor, limit, sort } = options;
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  const query = params.toString();
  const base = '/api/drafts';
  const url = query ? `${base}?${query}` : base;

  return useQuery({
    queryKey: [...DRAFTS_KEY, 'all', { cursor, limit, sort }],
    queryFn: () => api.get<PaginatedResponse<Draft>>(url),
  });
}

export function useDraft(projectId: string, draftId: string) {
  return useQuery({
    queryKey: [...DRAFTS_KEY, projectId, draftId],
    queryFn: () => api.get<Draft>(`/api/projects/${projectId}/drafts/${draftId}`),
  });
}

export function useDraftById(draftId: string) {
  return useQuery({
    queryKey: [...DRAFTS_KEY, 'detail', draftId],
    queryFn: () => api.get<Draft>(`/api/drafts/${draftId}`),
    enabled: !!draftId,
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] });
      queryClient.invalidateQueries({
        queryKey: [...DRAFTS_KEY, 'detail', variables.draftId],
      });
    },
  });
}

export async function saveThumbnail(draftId: string, blob: Blob) {
  const res = await fetch(`/api/drafts/${draftId}/thumbnail`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error('Failed to save thumbnail');
  const json = (await res.json()) as { url: string };
  queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
  return json;
}

export function useDeleteDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      api.delete<{ ok: true }>(`/api/projects/${projectId}/drafts/${draftId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] }),
  });
}
