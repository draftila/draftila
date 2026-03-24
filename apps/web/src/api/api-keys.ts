import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

const API_KEYS_KEY = ['api-keys'] as const;

interface ApiKey {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: () => api.get<{ data: ApiKey[] }>('/api/api-keys').then((r) => r.data),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<CreateApiKeyResponse>('/api/api-keys', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete('/api/api-keys/' + id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}
