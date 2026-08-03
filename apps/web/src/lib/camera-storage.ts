import type { Camera } from '@draftila/shared';
import { clampZoom } from '@draftila/engine/camera';

export const CAMERA_STORAGE_PREFIX = 'draftila:camera:';
export const CAMERA_STORAGE_VERSION = 1;
export const MAX_TRACKED_DRAFTS = 30;
export const MAX_TRACKED_PAGES_PER_DRAFT = 40;

/**
 * Camera x/y are screen-space offsets (roughly `-worldCoord * zoom + screenOffset`).
 * With MAX_ZOOM = 256 this admits world coordinates up to ~3.9e7 while still
 * rejecting garbage that would render a blank void.
 */
const MAX_OFFSET = 1e10;

export interface StoredPageCamera {
  x: number;
  y: number;
  zoom: number;
  /** Canvas viewport size at save time, used to re-centre when the window changed. */
  vw?: number;
  vh?: number;
  t: number;
}

export interface DraftCameraRecord {
  v: number;
  t: number;
  pages: Record<string, StoredPageCamera>;
}

export interface ViewportSize {
  width: number;
  height: number;
}

let warned = false;

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn('[camera-storage] unable to persist camera state');
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(draftId: string): string {
  return `${CAMERA_STORAGE_PREFIX}${draftId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function sanitizeViewport(viewport: ViewportSize | null | undefined): ViewportSize | null {
  if (!viewport) return null;
  const { width, height } = viewport;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function sanitizeStoredCamera(value: unknown): StoredPageCamera | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y, zoom, vw, vh, t } = value as Record<string, unknown>;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) return null;
  if (Math.abs(x) > MAX_OFFSET || Math.abs(y) > MAX_OFFSET) return null;

  const stored: StoredPageCamera = {
    x,
    y,
    zoom: clampZoom(zoom),
    t: isFiniteNumber(t) ? t : 0,
  };

  const viewport = sanitizeViewport(
    isFiniteNumber(vw) && isFiniteNumber(vh) ? { width: vw, height: vh } : null,
  );
  if (viewport) {
    stored.vw = viewport.width;
    stored.vh = viewport.height;
  }

  return stored;
}

export function parseDraftRecord(raw: string | null): DraftCameraRecord | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const { v, t, pages } = parsed as Record<string, unknown>;
  if (v !== CAMERA_STORAGE_VERSION) return null;
  if (typeof pages !== 'object' || pages === null || Array.isArray(pages)) return null;

  const record: DraftCameraRecord = {
    v: CAMERA_STORAGE_VERSION,
    t: isFiniteNumber(t) ? t : 0,
    pages: {},
  };

  for (const [pageId, entry] of Object.entries(pages as Record<string, unknown>)) {
    const camera = sanitizeStoredCamera(entry);
    if (camera) record.pages[pageId] = camera;
  }

  return record;
}

/**
 * Drop the oldest page entries until at most `max` remain. `keepPageId` is never
 * evicted: `t` ties are reachable in production (a single flush writes every
 * pending entry in one task), which would otherwise make the victim
 * sort-order-dependent and could drop the entry just written.
 */
export function prunePages(
  record: DraftCameraRecord,
  max: number,
  keepPageId: string,
): DraftCameraRecord {
  const ids = Object.keys(record.pages);
  if (ids.length <= max) return record;

  const pages = { ...record.pages };
  const candidates = ids
    .filter((id) => id !== keepPageId)
    .sort((a, b) => (pages[a]?.t ?? 0) - (pages[b]?.t ?? 0));

  let count = ids.length;
  for (const id of candidates) {
    if (count <= max) break;
    delete pages[id];
    count--;
  }

  return { ...record, pages };
}

function listCameraKeys(storage: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(CAMERA_STORAGE_PREFIX)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

/** Sort key for LRU eviction. Unparseable records go first so they cannot become immortal. */
function recordTime(storage: Storage, key: string): number {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return -Infinity;
  }
  const record = parseDraftRecord(raw);
  if (!record || !Number.isFinite(record.t)) return -Infinity;
  return record.t;
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Write, and on quota exhaustion free other camera keys oldest-first, retrying
 * after each removal. Never throws.
 */
function writeRecord(storage: Storage, key: string, record: DraftCameraRecord): boolean {
  const json = JSON.stringify(record);

  try {
    storage.setItem(key, json);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) {
      warnOnce();
      return false;
    }
  }

  const candidates = listCameraKeys(storage)
    .filter((candidate) => candidate !== key)
    .map((candidate) => ({ key: candidate, t: recordTime(storage, candidate) }))
    .sort((a, b) => a.t - b.t);

  for (const candidate of candidates) {
    try {
      storage.removeItem(candidate.key);
    } catch {
      // Nothing else to try for this candidate.
    }
    try {
      storage.setItem(key, json);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) {
        warnOnce();
        return false;
      }
    }
  }

  warnOnce();
  return false;
}

/**
 * Enforce the cross-draft cap. Runs only when a draft key was created, and only
 * after the write, so the count it sees already includes the new key.
 */
function evictDraftsBeyondCap(storage: Storage, justWrittenKey: string): void {
  const keys = listCameraKeys(storage);
  if (keys.length <= MAX_TRACKED_DRAFTS) return;

  const candidates = keys
    .filter((key) => key !== justWrittenKey)
    .map((key) => ({ key, t: recordTime(storage, key) }))
    .sort((a, b) => a.t - b.t);

  let count = keys.length;
  for (const candidate of candidates) {
    if (count <= MAX_TRACKED_DRAFTS) break;
    try {
      storage.removeItem(candidate.key);
    } catch {
      // Skip keys we cannot remove; the loop still terminates.
    }
    count--;
  }
}

export function loadPageCamera(draftId: string, pageId: string): StoredPageCamera | null {
  const storage = getStorage();
  if (!storage || !draftId || !pageId) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(keyFor(draftId));
  } catch {
    return null;
  }

  return parseDraftRecord(raw)?.pages[pageId] ?? null;
}

export function savePageCamera(
  draftId: string,
  pageId: string,
  camera: Camera,
  viewport: ViewportSize | null,
): void {
  const storage = getStorage();
  if (!storage || !draftId || !pageId) return;
  if (!isFiniteNumber(camera.x) || !isFiniteNumber(camera.y) || !isFiniteNumber(camera.zoom)) {
    return;
  }

  const key = keyFor(draftId);

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return;
  }

  // Detected from the raw value, not the parsed one: a corrupt existing key must
  // not be mistaken for a new draft and trigger the cross-draft sweep every save.
  const isNewKey = raw === null;
  const existing = parseDraftRecord(raw);
  const now = Date.now();

  const entry: StoredPageCamera = {
    x: camera.x,
    y: camera.y,
    zoom: clampZoom(camera.zoom),
    t: now,
  };
  const size = sanitizeViewport(viewport);
  if (size) {
    entry.vw = size.width;
    entry.vh = size.height;
  }

  const record: DraftCameraRecord = {
    v: CAMERA_STORAGE_VERSION,
    t: now,
    pages: { ...(existing?.pages ?? {}), [pageId]: entry },
  };

  if (!writeRecord(storage, key, prunePages(record, MAX_TRACKED_PAGES_PER_DRAFT, pageId))) {
    return;
  }

  if (isNewKey) evictDraftsBeyondCap(storage, key);
}

export function removePageCamera(draftId: string, pageId: string): void {
  const storage = getStorage();
  if (!storage || !draftId || !pageId) return;

  const key = keyFor(draftId);

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return;
  }

  const record = parseDraftRecord(raw);
  if (!record || !(pageId in record.pages)) return;

  delete record.pages[pageId];

  try {
    if (Object.keys(record.pages).length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(record));
    }
  } catch {
    warnOnce();
  }
}

export function removeDraftCameras(draftId: string): void {
  const storage = getStorage();
  if (!storage || !draftId) return;
  try {
    storage.removeItem(keyFor(draftId));
  } catch {
    // Nothing to do; persistence is best-effort.
  }
}

/**
 * Stored value -> a fresh Camera for the current viewport. When the viewport
 * changed size, preserve the world point at the viewport centre rather than the
 * top-left, so the user is looking at the same content. Zoom is never rescaled.
 */
export function toRestoredCamera(stored: StoredPageCamera, viewport: ViewportSize | null): Camera {
  const zoom = clampZoom(stored.zoom);
  const current = sanitizeViewport(viewport);
  const original =
    stored.vw !== undefined && stored.vh !== undefined
      ? sanitizeViewport({ width: stored.vw, height: stored.vh })
      : null;

  if (
    !current ||
    !original ||
    (current.width === original.width && current.height === original.height)
  ) {
    return { x: stored.x, y: stored.y, zoom };
  }

  const worldCx = (original.width / 2 - stored.x) / zoom;
  const worldCy = (original.height / 2 - stored.y) / zoom;

  return {
    x: current.width / 2 - worldCx * zoom,
    y: current.height / 2 - worldCy * zoom,
    zoom,
  };
}
