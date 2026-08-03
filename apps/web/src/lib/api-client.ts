import type { ApiErrorResponse } from '@draftila/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
    /** Parsed `Retry-After` (seconds) — set on 429s so callers can auto-resume. */
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body: ApiErrorResponse = await res.json().catch(() => ({
      error: 'Unknown error',
    }));
    throw new ApiError(res.status, body.error, body.fieldErrors);
  }

  return res.json();
}

async function uploadRequest<T>(path: string, body: Blob | File): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': body.type },
    body,
  });

  if (!res.ok) {
    const errorBody: ApiErrorResponse = await res.json().catch(() => ({
      error: 'Upload failed',
    }));
    throw new ApiError(res.status, errorBody.error, errorBody.fieldErrors);
  }

  return res.json();
}

/**
 * Multipart POST. Deliberately sets NO `Content-Type` — the browser has to write the header itself
 * so it can include the multipart boundary (same as `useImportDraft` in `api/drafts.ts`).
 */
async function formRequest<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    body,
  });

  if (!res.ok) {
    const errorBody: ApiErrorResponse = await res.json().catch(() => ({
      error: 'Upload failed',
    }));
    const retryAfter = Number(res.headers.get('Retry-After'));
    throw new ApiError(
      res.status,
      errorBody.error,
      errorBody.fieldErrors,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, body: Blob | File) => uploadRequest<T>(path, body),
  postForm: <T>(path: string, body: FormData) => formRequest<T>(path, body),
};
