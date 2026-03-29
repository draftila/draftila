import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSnapshot, SnapshotWithAuthor, UpdateSnapshot } from '@draftila/shared';
import { api } from '@/lib/api-client';

const SNAPSHOTS_KEY = ['snapshots'] as const;

export function useSnapshots(draftId: string, includeAutoSaves = true) {
  return useQuery({
    queryKey: [...SNAPSHOTS_KEY, draftId, { includeAutoSaves }],
    queryFn: () =>
      api.get<SnapshotWithAuthor[]>(
        `/api/drafts/${draftId}/snapshots?autoSaves=${includeAutoSaves}`,
      ),
    enabled: !!draftId,
  });
}

export function useCreateSnapshot(draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSnapshot) =>
      api.post<SnapshotWithAuthor>(`/api/drafts/${draftId}/snapshots`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...SNAPSHOTS_KEY, draftId] });
    },
  });
}

export function useUpdateSnapshot(draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ snapshotId, data }: { snapshotId: string; data: UpdateSnapshot }) =>
      api.patch<SnapshotWithAuthor>(`/api/snapshots/${snapshotId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...SNAPSHOTS_KEY, draftId] });
    },
  });
}

export function useRestoreSnapshot(draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<SnapshotWithAuthor>(`/api/snapshots/${snapshotId}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...SNAPSHOTS_KEY, draftId] });
    },
  });
}

export async function fetchSnapshotState(snapshotId: string): Promise<Uint8Array> {
  const res = await fetch(`/api/snapshots/${snapshotId}/state`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch snapshot state');
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}
