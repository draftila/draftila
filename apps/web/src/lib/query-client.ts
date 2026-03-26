import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export function clearUserCache() {
  queryClient.clear();
  localStorage.removeItem('dashboard');
}

function handleGlobalError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    clearUserCache();
    window.location.href = '/login';
    return;
  }
}

function handleMutationError(error: unknown) {
  handleGlobalError(error);

  if (error instanceof ApiError) {
    toast.error(error.message);
  } else {
    toast.error('An unexpected error occurred.');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      onError: handleMutationError,
    },
  },
});
