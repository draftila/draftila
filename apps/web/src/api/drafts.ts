import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDraft,
  Draft,
  DraftExport,
  SortOrder,
  PaginatedResponse,
  UpdateDraft,
} from '@draftila/shared';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
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
  queryClient.invalidateQueries({
    queryKey: DRAFTS_KEY,
    predicate: (query) => !query.queryKey.includes('detail'),
  });
  return json;
}

export function useDeleteDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      api.delete<{ ok: true }>(`/api/projects/${projectId}/drafts/${draftId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, 'all'] });
    },
  });
}

export function useExportDraft(projectId: string) {
  return useMutation({
    mutationFn: (draftId: string) =>
      api.get<DraftExport>(`/api/projects/${projectId}/drafts/${draftId}/export`),
  });
}

export function useExportAllDrafts(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/drafts/export-all`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new ApiError(res.status, body.error);
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/zip')) {
        return { type: 'zip' as const, blob: await res.blob() };
      }
      return { type: 'json' as const, data: (await res.json()) as DraftExport };
    },
  });
}

export function useImportDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/drafts/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }));
        throw new ApiError(res.status, body.error, body.fieldErrors);
      }
      return (await res.json()) as Draft;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [...DRAFTS_KEY, 'all'] });
    },
  });
}
