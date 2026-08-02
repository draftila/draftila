import { lookup } from 'node:dns/promises';
import { loadImage } from '@napi-rs/canvas';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function toIpv4Octets(address: string): number[] | null {
  const mapped = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  const parts = mapped.split('.');
  if (parts.length !== 4) return null;
  return parts.map((part) => Number(part));
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedAddress(address: string): boolean {
  const octets = toIpv4Octets(address);
  if (octets) return isBlockedIpv4(octets);

  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true;
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  return false;
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported image protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(`Blocked image host: ${hostname}`);
  }
}

async function readCappedBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the maximum allowed size');
  }

  const body = response.body;
  if (!body) throw new Error('Image response has no body');

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error('Image exceeds the maximum allowed size');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export function decodeDataUri(src: string): Buffer {
  const commaIndex = src.indexOf(',');
  if (commaIndex < 0) throw new Error('Malformed image data URI');

  const meta = src.slice('data:'.length, commaIndex);
  const payload = src.slice(commaIndex + 1);
  if (meta.endsWith(';base64')) return Buffer.from(payload, 'base64');
  return Buffer.from(decodeURIComponent(payload), 'utf-8');
}

export async function fetchImageBytes(src: string): Promise<Buffer> {
  let url = new URL(src);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicUrl(url);

    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    });

    const location = response.headers.get('location');
    if (REDIRECT_STATUSES.has(response.status) && location) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Image request failed with status ${response.status}`);
    }

    return readCappedBody(response);
  }

  throw new Error('Too many redirects while loading image');
}

export async function loadServerImage(src: string): Promise<HTMLImageElement> {
  const bytes = src.startsWith('data:') ? decodeDataUri(src) : await fetchImageBytes(src);
  const image = await loadImage(bytes);
  return image as unknown as HTMLImageElement;
}
