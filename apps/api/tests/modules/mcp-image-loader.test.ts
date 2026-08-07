import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { deflateSync, crc32 } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { getStorage, initStorage } from '../../src/common/lib/storage';
import {
  decodeDataUri,
  fetchImageBytes,
  loadServerImage,
  loadServerImageAsset,
  requestPinnedImage,
  setImageRequestSender,
  type ImageRequestSender,
} from '../../src/modules/mcp/image-loader';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"></svg>';
const PUBLIC_HOST = 'http://93.184.216.34/image.png';
const PUBLIC_IPV6_HOST = 'http://[2606:2800:220:1:248:1893:25c8:1946]/image.png';

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, checksum]);
}

function grayscalePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc(height * (1 + width)), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function responseOf(
  status: number,
  headers: Record<string, string>,
  chunks: Uint8Array[],
): IncomingMessage {
  const stream = Readable.from(chunks) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = headers;
  return stream;
}

function stubSender(handler: (url: URL) => IncomingMessage) {
  const sender: ImageRequestSender = (url) => Promise.resolve(handler(url));
  setImageRequestSender(sender);
}

describe('mcp image loader', () => {
  afterEach(() => {
    setImageRequestSender(requestPinnedImage);
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

    test('rejects oversized data URI payloads', () => {
      const oversized = 'A'.repeat(21 * 1024 * 1024);
      expect(() => decodeDataUri(`data:image/png,${oversized}`)).toThrow(
        'Image exceeds the maximum allowed size',
      );
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

    test('rasterizes svg assets before storing them', async () => {
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
      const asset = await loadServerImageAsset(uri);

      expect(asset.extension).toBe('png');
      expect(asset.bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    });

    test('stores browser-renderable formats as the original bytes', async () => {
      const asset = await loadServerImageAsset(`data:image/png;base64,${PNG_BASE64}`);

      expect(asset.extension).toBe('png');
      expect(asset.bytes).toEqual(PNG_BYTES);
    });

    test('loads app-owned storage URLs for server exports', async () => {
      const storageDirectory = await mkdtemp(join(tmpdir(), 'draftila-mcp-images-'));
      initStorage({ driver: 'local', path: storageDirectory });

      try {
        await getStorage().put('draft-assets/draft-1/image.png', PNG_BYTES);
        const image = await loadServerImage('/storage/draft-assets/draft-1/image.png');
        expect(image.naturalWidth).toBe(1);
        expect(image.naturalHeight).toBe(1);
      } finally {
        await rm(storageDirectory, { recursive: true, force: true });
      }
    });
  });

  describe('decode limits', () => {
    test('rejects a raster image that decodes beyond the pixel budget', async () => {
      const bomb = grayscalePng(10000, 10000);
      expect(bomb.byteLength).toBeLessThan(1024 * 1024);

      await expect(
        loadServerImage(`data:image/png;base64,${bomb.toString('base64')}`),
      ).rejects.toThrow('Image exceeds the maximum allowed pixel count');
    });

    test('rejects an svg that rasterises beyond the pixel budget', async () => {
      const huge = '<svg xmlns="http://www.w3.org/2000/svg" width="60000" height="60000"></svg>';
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(huge)}`;

      await expect(loadServerImage(uri)).rejects.toThrow(
        'Image exceeds the maximum allowed pixel count',
      );
    });

    test('rejects payloads whose format cannot be read', async () => {
      const uri = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;

      await expect(loadServerImage(uri)).rejects.toThrow('Unsupported or unreadable image format');
    });

    test('returns an image whose pixels are drawable in the same tick', async () => {
      const source = createCanvas(8, 8);
      const sourceCtx = source.getContext('2d');
      sourceCtx.fillStyle = '#ff0000';
      sourceCtx.fillRect(0, 0, 8, 8);
      const uri = `data:image/png;base64,${source.toBuffer('image/png').toString('base64')}`;

      const image = await loadServerImage(uri);

      // Setting `Image.src` resolves the metadata synchronously but decodes the pixels later, so a
      // loader that does not await the decode hands back an image that draws as fully transparent.
      const target = createCanvas(8, 8);
      const targetCtx = target.getContext('2d');
      targetCtx.drawImage(image as unknown as Parameters<typeof targetCtx.drawImage>[0], 0, 0);

      expect([...targetCtx.getImageData(4, 4, 1, 1).data]).toEqual([255, 0, 0, 255]);
    });
  });

  describe('remote images', () => {
    test('downloads and decodes a remote image', async () => {
      stubSender(() => responseOf(200, {}, [PNG_BYTES]));
      const image = await loadServerImage(PUBLIC_HOST);
      expect(image.naturalWidth).toBe(1);
    });

    test('allows public IPv6 hosts', async () => {
      stubSender(() => responseOf(200, {}, [PNG_BYTES]));
      expect(await fetchImageBytes(PUBLIC_IPV6_HOST)).toEqual(PNG_BYTES);
    });

    test('follows redirects', async () => {
      stubSender((url) =>
        url.pathname === '/image.png'
          ? responseOf(302, { location: '/final.png' }, [])
          : responseOf(200, {}, [PNG_BYTES]),
      );

      expect(await fetchImageBytes(PUBLIC_HOST)).toEqual(PNG_BYTES);
    });

    test('rejects redirect loops', async () => {
      stubSender(() => responseOf(302, { location: '/image.png' }, []));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Too many redirects');
    });

    test('rejects error responses', async () => {
      stubSender(() => responseOf(404, {}, [Buffer.from('nope')]));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow(
        'Image request failed with status 404',
      );
    });

    test('rejects responses without a body', async () => {
      stubSender(() => responseOf(200, {}, []));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Image response has no body');
    });

    test('rejects responses declaring an oversized body', async () => {
      stubSender(() =>
        responseOf(200, { 'content-length': String(64 * 1024 * 1024) }, [PNG_BYTES]),
      );

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow(
        'Image exceeds the maximum allowed size',
      );
    });

    test('rejects bodies that stream past the size limit', async () => {
      stubSender(() =>
        responseOf(
          200,
          {},
          Array.from({ length: 21 }, () => new Uint8Array(1024 * 1024)),
        ),
      );

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

    test('rejects hosts that do not resolve', async () => {
      await expect(fetchImageBytes('http://unresolvable.invalid/image.png')).rejects.toThrow();
    });

    test('rejects redirects that point at a private host', async () => {
      stubSender(() => responseOf(302, { location: 'http://127.0.0.1/image.png' }, []));

      await expect(fetchImageBytes(PUBLIC_HOST)).rejects.toThrow('Blocked image host');
    });
  });

  describe('pinned transport', () => {
    let server: Server;
    let port = 0;

    beforeAll(async () => {
      server = createServer((request: IncomingMessage, response: ServerResponse) => {
        if (request.url === '/image.png') {
          response.writeHead(200, { 'content-type': 'image/png' });
          response.end(PNG_BYTES);
          return;
        }
        response.writeHead(404);
        response.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      port = (server.address() as { port: number }).port;
    });

    afterAll(() => {
      server.closeAllConnections();
      server.close();
    });

    test('connects to the pinned address instead of re-resolving the hostname', async () => {
      const url = new URL(`http://pinned.invalid:${port}/image.png`);
      const response = await requestPinnedImage(
        url,
        { address: '127.0.0.1', family: 4 },
        AbortSignal.timeout(5_000),
      );

      const chunks: Buffer[] = [];
      for await (const chunk of response) chunks.push(chunk as Buffer);

      expect(response.statusCode).toBe(200);
      expect(Buffer.concat(chunks)).toEqual(PNG_BYTES);
    });

    test('surfaces connection failures', async () => {
      const url = new URL('http://pinned.invalid:1/image.png');

      await expect(
        requestPinnedImage(url, { address: '127.0.0.1', family: 4 }, AbortSignal.timeout(5_000)),
      ).rejects.toThrow();
    });

    test('rejects immediately when the deadline has already passed', async () => {
      const url = new URL(`http://pinned.invalid:${port}/image.png`);

      await expect(
        requestPinnedImage(url, { address: '127.0.0.1', family: 4 }, AbortSignal.abort()),
      ).rejects.toThrow('Image request aborted');
    });
  });
});
