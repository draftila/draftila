import { getMimeType } from 'hono/utils/mime';

export function createFileResponse(path: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', getMimeType(path) ?? 'application/octet-stream');
  return new Response(Bun.file(path), { ...init, headers });
}
