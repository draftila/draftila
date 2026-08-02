import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Image } from '@napi-rs/canvas';
import { imageSize } from 'image-size';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 30_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface PinnedAddress {
  address: string;
  family: number;
}

export type ImageRequestSender = (
  url: URL,
  address: PinnedAddress,
  signal: AbortSignal,
) => Promise<IncomingMessage>;

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

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

async function resolvePublicAddress(url: URL): Promise<PinnedAddress> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported image protocol: ${url.protocol}`);
  }

  const hostname = stripBrackets(url.hostname);
  const addresses = await lookup(hostname, { all: true });
  const [resolved] = addresses;
  if (!resolved || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(`Blocked image host: ${hostname}`);
  }

  return { address: resolved.address, family: resolved.family };
}

export function requestPinnedImage(
  url: URL,
  address: PinnedAddress,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const options: RequestOptions = {
    protocol: url.protocol,
    hostname: stripBrackets(url.hostname),
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    headers: { Accept: 'image/*' },
    signal,
    agent: false,
    lookup: (_hostname, lookupOptions, callback) => {
      if (lookupOptions.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    },
  };

  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Image request aborted'));
    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
    const request = send(options, (response) => {
      signal.removeEventListener('abort', abort);
      resolve(response);
    });
    request.on('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    request.end();
  });
}

let sendImageRequest: ImageRequestSender = requestPinnedImage;

export function setImageRequestSender(sender: ImageRequestSender) {
  sendImageRequest = sender;
}

async function readCappedBody(response: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number(response.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    response.destroy();
    throw new Error('Image exceeds the maximum allowed size');
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response) {
    const bytes = chunk as Buffer;
    total += bytes.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      response.destroy();
      throw new Error('Image exceeds the maximum allowed size');
    }
    chunks.push(bytes);
  }

  if (total === 0) throw new Error('Image response has no body');

  return Buffer.concat(chunks);
}

function largestFramePixels(dimensions: ReturnType<typeof imageSize>): number {
  return (dimensions.images ?? []).reduce(
    (largest, frame) => Math.max(largest, frame.width * frame.height),
    dimensions.width * dimensions.height,
  );
}

function assertDecodableSize(bytes: Buffer): void {
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new Error('Unsupported or unreadable image format');
  }

  if (largestFramePixels(dimensions) > MAX_IMAGE_PIXELS) {
    throw new Error('Image exceeds the maximum allowed pixel count');
  }
}

export function decodeDataUri(src: string): Buffer {
  const commaIndex = src.indexOf(',');
  if (commaIndex < 0) throw new Error('Malformed image data URI');

  const meta = src.slice('data:'.length, commaIndex);
  const payload = src.slice(commaIndex + 1);
  const bytes = meta.endsWith(';base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the maximum allowed size');
  }

  return bytes;
}

export async function fetchImageBytes(src: string): Promise<Buffer> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let url = new URL(src);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const address = await resolvePublicAddress(url);
    const response = await sendImageRequest(url, address, signal);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (REDIRECT_STATUSES.has(status) && location) {
      response.resume();
      url = new URL(location, url);
      continue;
    }

    if (status < 200 || status > 299) {
      response.destroy();
      throw new Error(`Image request failed with status ${status}`);
    }

    return readCappedBody(response);
  }

  throw new Error('Too many redirects while loading image');
}

export async function loadServerImage(src: string): Promise<HTMLImageElement> {
  const bytes = src.startsWith('data:') ? decodeDataUri(src) : await fetchImageBytes(src);
  assertDecodableSize(bytes);

  const image = new Image();
  try {
    image.src = bytes;
  } catch {
    throw new Error('Unsupported or unreadable image format');
  }

  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('Unsupported or unreadable image format');
  }

  return image as unknown as HTMLImageElement;
}
