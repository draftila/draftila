import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMcpToken, CreateMcpTokenResponse, McpToken } from '@draftila/shared';
import { api } from '@/lib/api-client';

const MCP_TOKENS_KEY = ['mcp', 'tokens'] as const;

export function useMcpTokens() {
  return useQuery({
    queryKey: MCP_TOKENS_KEY,
    queryFn: () => api.get<{ data: McpToken[] }>('/api/mcp/tokens'),
  });
}

export function useCreateMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMcpToken) => api.post<CreateMcpTokenResponse>('/api/mcp/tokens', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MCP_TOKENS_KEY }),
  });
}

export function useRevokeMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/api/mcp/tokens/${id}/revoke`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MCP_TOKENS_KEY }),
  });
}
