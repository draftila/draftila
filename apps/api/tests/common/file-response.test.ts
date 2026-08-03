import { describe, expect, test } from 'bun:test';
import { createFileResponse } from '../../src/common/lib/file-response';

describe('createFileResponse', () => {
  test.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['application.js', 'text/javascript; charset=utf-8'],
    ['styles.css', 'text/css; charset=utf-8'],
    ['favicon.svg', 'image/svg+xml'],
    ['font.woff2', 'font/woff2'],
    ['module.wasm', 'application/wasm'],
    ['unknown.asset', 'application/octet-stream'],
  ])('sets the content type for %s', (path, expected) => {
    expect(createFileResponse(path).headers.get('Content-Type')).toBe(expected);
  });

  test('preserves additional response headers', () => {
    const response = createFileResponse('image.png', {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });

    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
