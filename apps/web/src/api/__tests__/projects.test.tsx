import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProjects, useProject, useCreateProject, useDeleteProject } from '../projects';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '@/lib/api-client';

const mockApi = vi.mocked(api);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useProjects', () => {
  test('fetches projects without params', async () => {
    mockApi.get.mockResolvedValue({ data: [], nextCursor: null });
    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.get).toHaveBeenCalledWith('/api/projects');
    expect(result.current.data).toEqual({ data: [], nextCursor: null });
  });

  test('fetches projects with cursor and limit', async () => {
    mockApi.get.mockResolvedValue({ data: [], nextCursor: null });
    const { result } = renderHook(() => useProjects('abc', 10), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.get).toHaveBeenCalledWith('/api/projects?cursor=abc&limit=10');
  });
});

describe('useProject', () => {
  test('fetches a single project by id', async () => {
    mockApi.get.mockResolvedValue({ id: '1', name: 'Test' });
    const { result } = renderHook(() => useProject('1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.get).toHaveBeenCalledWith('/api/projects/1');
    expect(result.current.data).toEqual({ id: '1', name: 'Test' });
  });
});

describe('useCreateProject', () => {
  test('calls api.post and invalidates queries on success', async () => {
    mockApi.post.mockResolvedValue({ id: '1', name: 'New' });
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProject(), { wrapper });

    result.current.mutate({ name: 'New' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.post).toHaveBeenCalledWith('/api/projects', { name: 'New' });
  });
});

describe('useDeleteProject', () => {
  test('calls api.delete and invalidates queries on success', async () => {
    mockApi.delete.mockResolvedValue({ ok: true });
    const wrapper = createWrapper();
    const { result } = renderHook(() => useDeleteProject(), { wrapper });

    result.current.mutate('1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/1');
  });
});
