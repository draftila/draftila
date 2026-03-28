import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CommentResponse,
  CreateComment,
  MarkAllCommentsRead,
  UpdateComment,
} from '@draftila/shared';
import { api } from '@/lib/api-client';

const COMMENTS_KEY = ['comments'] as const;

export function useComments(draftId: string, pageId: string | null) {
  return useQuery({
    queryKey: [...COMMENTS_KEY, draftId, pageId],
    queryFn: () =>
      api.get<CommentResponse[]>(
        `/api/drafts/${draftId}/comments?pageId=${encodeURIComponent(pageId!)}`,
      ),
    enabled: !!draftId && !!pageId,
  });
}

export function useCreateComment(draftId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateComment) =>
      api.post<CommentResponse>(`/api/drafts/${draftId}/comments`, payload),
    onSuccess: (_comment, variables) => {
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, draftId, variables.pageId] });
    },
  });
}

export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, data }: { commentId: string; data: UpdateComment }) =>
      api.patch<CommentResponse>(`/api/comments/${commentId}`, data),
    onSuccess: (comment) => {
      queryClient.invalidateQueries({
        queryKey: [...COMMENTS_KEY, comment.draftId, comment.pageId],
      });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string }) =>
      api.delete<{ ok: true }>(`/api/comments/${commentId}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_KEY });
    },
  });
}

export function useToggleCommentResolved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string }) =>
      api.post<CommentResponse>(`/api/comments/${commentId}/resolve`, {}),
    onSuccess: (comment) => {
      queryClient.invalidateQueries({
        queryKey: [...COMMENTS_KEY, comment.draftId, comment.pageId],
      });
    },
  });
}

export function useMarkCommentRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string }) =>
      api.post<{ ok: true }>(`/api/comments/${commentId}/read`, {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_KEY });
    },
  });
}

export function useMarkAllCommentsRead(draftId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MarkAllCommentsRead) =>
      api.post<{ ok: true }>(`/api/drafts/${draftId}/comments/read-all`, payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, draftId, variables.pageId] });
    },
  });
}
