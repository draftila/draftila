import { afterEach, describe, expect, test } from 'bun:test';
import {
  decodeDataUri,
  fetchImageBytes,
  loadServerImage,
} from '../../src/modules/mcp/image-loader';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"></svg>';
const PUBLIC_HOST = 'http://93.184.216.34/image.png';
const PUBLIC_IPV6_HOST = 'http://[2606:2800:220:1:248:1893:25c8:1946]/image.png';

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: URL) => Response) {
  globalThis.fetch = ((input: string | URL | Request) =>
    Promise.resolve(handler(new URL(String(input))))) as typeof fetch;
}

function streamOf(chunkCount: number, chunkSize: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < chunkCount; i++) controller.enqueue(new Uint8Array(chunkSize));
      controller.close();
    },
  });
  return new Response(stream);
}

describe('mcp image loader', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('data URIs', () => {
    test('decodes base64 payloads', () => {
      expect(decodeDataUri(`data:image/png;base64,${PNG_BASE64}`)).toEqual(PNG_BYTES);
    });

    test('decodes percent-encoded payloads', () => {
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
      expect(decodeDataUri(uri).toString('utf-8')).toBe(SVG);
    });

    test('rejects malformed data URIs', () => {
      expect(() => decodeDataUri('data:image/png;base64')).toThrow('Malformed image data URI');
    });

    test('loads a raster image without touching the network', async () => {
      const image = await loadServerImage(`data:image/png;base64,${PNG_BASE64}`);
      expect(image.naturalWidth).toBe(1);
      expect(image.naturalHeight).toBe(1);
    });

    test('loads a percent-encoded svg data URI', async () => {
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
      const image = await loadServerImage(uri);
      expect(image.naturalWidth).toBe(24);
      expect(image.naturalHeight).toBe(24);
    });
  });

  describe('remote images', () => {
    test('downloads and decodes a remote image', async () => {
      stubFetch(() => new Response(PNG_BYTES));
      const image = await loadServerImage(PUBLIC_HOST);
      expect(image.naturalWidth).toBe(1);
    });

    test('allows public IPv6 hosts', async () => {
      stubFetch(() => new Response(PNG_BYTES));
      expect(await fetchImageBytes(PUBLIC_IPV6_HOST)).toEqual(PNG_BYTES);
    });

    test('follows redirects', async () => {
      stubFetch((url) =>
        url.pathname === '/image.png'
          ? new Response('', { status: 302, headers: { location: '/final.png' } })
          : new Response(PNG_BYTES),
      );

      expect(await fetchImageBytes(PUBLIC_HOST)).toEqual(PNG_BYTES);
    });

    test('rejects redirect loops', async () => {
      stubFetch(() => new Response('', { status: 302, headers: { location: '/image.png' } }));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Too many redirects');
    });

    test('rejects error responses', async () => {
      stubFetch(() => new Response('nope', { status: 404 }));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow(
        'Image request failed with status 404',
      );
    });

    test('rejects responses without a body', async () => {
      stubFetch(() => new Response(null, { status: 200 }));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Image response has no body');
    });

    test('rejects responses declaring an oversized body', async () => {
      stubFetch(
        () =>
          new Response(PNG_BYTES, {
            headers: { 'content-length': String(64 * 1024 * 1024) },
          }),
      );

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow(
        'Image exceeds the maximum allowed size',
      );
    });

    test('rejects bodies that stream past the size limit', async () => {
      stubFetch(() => streamOf(21, 1024 * 1024));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow(
        'Image exceeds the maximum allowed size',
      );
    });
  });

  describe('host restrictions', () => {
    test('rejects non-http protocols', async () => {
      await expect(fetchImageBytes('ftp://93.184.216.34/image.png')).rejects.toThrow(
        'Unsupported image protocol',
      );
    });

    test.each([
      'http://127.0.0.1/image.png',
      'http://10.0.0.5/image.png',
      'http://169.254.169.254/latest/meta-data',
      'http://192.168.1.10/image.png',
      'http://[::1]/image.png',
      'http://[fd00::1]/image.png',
    ])('rejects private host %s', async (url) => {
      await expect(fetchImageBytes(url)).rejects.toThrow('Blocked image host');
    });

    test('rejects redirects that point at a private host', async () => {
      stubFetch(
        () =>
          new Response('', {
            status: 302,
            headers: { location: 'http://127.0.0.1/image.png' },
          }),
      );

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Blocked image host');
    });
  });
});
