import { api, ApiError } from '../api-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiError', () => {
  test('stores status, message, and fieldErrors', () => {
    const error = new ApiError(400, 'Bad request', { name: ['Required'] });
    expect(error.status).toBe(400);
    expect(error.message).toBe('Bad request');
    expect(error.fieldErrors).toEqual({ name: ['Required'] });
  });

  test('is an instance of Error', () => {
    const error = new ApiError(500, 'Server error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('api.get', () => {
  test('sends GET request with credentials and json content-type', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
    await api.get('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));
    const result = await api.get<{ id: string; name: string }>('/api/test');
    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  test('throws ApiError with field errors on failure', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'Validation failed', fieldErrors: { name: ['Required'] } }, 400),
    );

    const error = await api.get('/api/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe('Validation failed');
    expect((error as ApiError).fieldErrors).toEqual({ name: ['Required'] });
  });

  test('throws ApiError with fallback message when response is not JSON', async () => {
    mockFetch.mockResolvedValue(new Response('not json', { status: 500 }));

    const error = await api.get('/api/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toBe('Unknown error');
  });
});

describe('api.post', () => {
  test('sends POST with JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
    await api.post('/api/test', { name: 'Test' });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'POST',
      body: '{"name":"Test"}',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

describe('api.put', () => {
  test('sends PUT with JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
    await api.put('/api/test', { name: 'Updated' });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'PUT',
      body: '{"name":"Updated"}',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

describe('api.patch', () => {
  test('sends PATCH with JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
    await api.patch('/api/test', { name: 'Patched' });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'PATCH',
      body: '{"name":"Patched"}',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

describe('api.delete', () => {
  test('sends DELETE request', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await api.delete('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
