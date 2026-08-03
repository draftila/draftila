import { describe, expect, test, beforeEach } from 'bun:test';
import {
  CAMERA_STORAGE_PREFIX,
  MAX_TRACKED_DRAFTS,
  MAX_TRACKED_PAGES_PER_DRAFT,
  loadPageCamera,
  parseDraftRecord,
  prunePages,
  removeDraftCameras,
  removePageCamera,
  sanitizeStoredCamera,
  sanitizeViewport,
  savePageCamera,
  toRestoredCamera,
  type DraftCameraRecord,
} from '../src/lib/camera-storage';
import { MemoryStorage } from './setup';

const CAM = { x: 10, y: 20, zoom: 2 };

function keyFor(draftId: string): string {
  return `${CAMERA_STORAGE_PREFIX}${draftId}`;
}

function rawRecord(draftId: string): DraftCameraRecord | null {
  return parseDraftRecord(localStorage.getItem(keyFor(draftId)));
}

function cameraKeyCount(): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(CAMERA_STORAGE_PREFIX)) count++;
  }
  return count;
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

describe('sanitizeStoredCamera', () => {
  test('rejects non-finite, missing and non-numeric fields', () => {
    expect(sanitizeStoredCamera(null)).toBeNull();
    expect(sanitizeStoredCamera('nope')).toBeNull();
    expect(sanitizeStoredCamera({ x: NaN, y: 0, zoom: 1 })).toBeNull();
    expect(sanitizeStoredCamera({ x: Infinity, y: 0, zoom: 1 })).toBeNull();
    expect(sanitizeStoredCamera({ x: '0', y: 0, zoom: 1 })).toBeNull();
    expect(sanitizeStoredCamera({ y: 0, zoom: 1 })).toBeNull();
  });

  test('clamps zoom into [MIN_ZOOM, MAX_ZOOM]', () => {
    expect(sanitizeStoredCamera({ x: 0, y: 0, zoom: 1e9 })?.zoom).toBe(256);
    expect(sanitizeStoredCamera({ x: 0, y: 0, zoom: 1e-9 })?.zoom).toBe(0.02);
  });

  test('rejects absurd offsets but keeps entries with invalid viewports', () => {
    expect(sanitizeStoredCamera({ x: 1e11, y: 0, zoom: 1 })).toBeNull();
    const kept = sanitizeStoredCamera({ x: 1, y: 2, zoom: 1, vw: 0, vh: -5 });
    expect(kept).not.toBeNull();
    expect(kept?.vw).toBeUndefined();
    expect(kept?.vh).toBeUndefined();
  });

  test('coerces a non-finite timestamp to 0', () => {
    expect(sanitizeStoredCamera({ x: 0, y: 0, zoom: 1, t: NaN })?.t).toBe(0);
  });
});

describe('sanitizeViewport', () => {
  test('rejects degenerate and non-finite sizes', () => {
    expect(sanitizeViewport({ width: 0, height: 0 })).toBeNull();
    expect(sanitizeViewport({ width: -1, height: 10 })).toBeNull();
    expect(sanitizeViewport({ width: NaN, height: 10 })).toBeNull();
    expect(sanitizeViewport(null)).toBeNull();
    expect(sanitizeViewport({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
});

describe('parseDraftRecord', () => {
  test('rejects bad JSON, wrong version and malformed pages', () => {
    expect(parseDraftRecord(null)).toBeNull();
    expect(parseDraftRecord('{ not json')).toBeNull();
    expect(parseDraftRecord(JSON.stringify({ v: 2, t: 1, pages: {} }))).toBeNull();
    expect(parseDraftRecord(JSON.stringify({ v: 1, t: 1, pages: [] }))).toBeNull();
    expect(parseDraftRecord(JSON.stringify({ v: 1, t: 1 }))).toBeNull();
  });

  test('drops individually corrupt page entries but keeps valid ones', () => {
    const raw = JSON.stringify({
      v: 1,
      t: 5,
      pages: { good: { x: 1, y: 2, zoom: 1, t: 5 }, bad: { x: NaN, y: 0, zoom: 1, t: 5 } },
    });
    const record = parseDraftRecord(raw);
    expect(Object.keys(record?.pages ?? {})).toEqual(['good']);
  });
});

describe('save/load roundtrip', () => {
  test('restores the same camera and viewport', () => {
    savePageCamera('d1', 'p1', CAM, { width: 800, height: 600 });
    const stored = loadPageCamera('d1', 'p1');
    expect(stored?.x).toBe(10);
    expect(stored?.y).toBe(20);
    expect(stored?.zoom).toBe(2);
    expect(stored?.vw).toBe(800);
    expect(stored?.vh).toBe(600);
    expect(typeof stored?.t).toBe('number');
  });

  test('a degenerate viewport stores no vw/vh', () => {
    savePageCamera('d1', 'p1', CAM, { width: 0, height: 0 });
    const stored = loadPageCamera('d1', 'p1');
    expect(stored).not.toBeNull();
    expect(stored?.vw).toBeUndefined();
  });

  test('unknown draft or page reads back null', () => {
    savePageCamera('d1', 'p1', CAM, null);
    expect(loadPageCamera('d1', 'other')).toBeNull();
    expect(loadPageCamera('other', 'p1')).toBeNull();
  });

  test('read-merge-write leaves sibling pages intact', () => {
    savePageCamera('d1', 'p1', CAM, null);
    savePageCamera('d1', 'p2', { x: -5, y: -6, zoom: 0.5 }, null);
    expect(loadPageCamera('d1', 'p1')?.x).toBe(10);
    expect(loadPageCamera('d1', 'p2')?.x).toBe(-5);
  });
});

describe('page LRU', () => {
  test('evicts the oldest entry past the cap', () => {
    const record: DraftCameraRecord = { v: 1, t: 0, pages: {} };
    for (let i = 0; i < MAX_TRACKED_PAGES_PER_DRAFT + 1; i++) {
      record.pages[`p${i}`] = { x: 0, y: 0, zoom: 1, t: i };
    }
    const pruned = prunePages(record, MAX_TRACKED_PAGES_PER_DRAFT, 'p40');
    expect(Object.keys(pruned.pages)).toHaveLength(MAX_TRACKED_PAGES_PER_DRAFT);
    expect(pruned.pages['p0']).toBeUndefined();
    expect(pruned.pages['p40']).toBeDefined();
  });

  test('the just-written page survives when every timestamp is identical', () => {
    // Reachable in production: one flush writes every pending entry in one task.
    const record: DraftCameraRecord = { v: 1, t: 0, pages: {} };
    for (let i = 0; i < MAX_TRACKED_PAGES_PER_DRAFT + 1; i++) {
      record.pages[`p${i}`] = { x: 0, y: 0, zoom: 1, t: 1000 };
    }
    const pruned = prunePages(record, MAX_TRACKED_PAGES_PER_DRAFT, 'p0');
    expect(Object.keys(pruned.pages)).toHaveLength(MAX_TRACKED_PAGES_PER_DRAFT);
    expect(pruned.pages['p0']).toBeDefined();
  });
});

describe('draft LRU', () => {
  test('creating one key past the cap evicts down to exactly the cap, keeping the new key', () => {
    for (let i = 0; i < MAX_TRACKED_DRAFTS + 1; i++) {
      savePageCamera(`d${i}`, 'p1', CAM, null);
    }
    expect(cameraKeyCount()).toBe(MAX_TRACKED_DRAFTS);
    // Tight loop ⇒ identical Date.now(); survival must not depend on timestamps.
    expect(loadPageCamera(`d${MAX_TRACKED_DRAFTS}`, 'p1')).not.toBeNull();
  });

  test('leaves unrelated draftila keys untouched', () => {
    localStorage.setItem('draftila:rulersVisible', 'true');
    for (let i = 0; i < MAX_TRACKED_DRAFTS + 5; i++) {
      savePageCamera(`d${i}`, 'p1', CAM, null);
    }
    expect(localStorage.getItem('draftila:rulersVisible')).toBe('true');
  });

  test('re-saving an existing key runs no cross-draft sweep', () => {
    savePageCamera('d1', 'p1', CAM, null);

    let enumerations = 0;
    const storage = localStorage;
    globalThis.localStorage = new Proxy(storage, {
      get(target, prop, receiver) {
        if (prop === 'length' || prop === 'key') enumerations++;
        return Reflect.get(target, prop, receiver);
      },
    }) as Storage;

    savePageCamera('d1', 'p2', CAM, null);
    expect(enumerations).toBe(0);
  });

  test('an existing-but-corrupt key does not trigger the sweep', () => {
    localStorage.setItem(keyFor('d1'), 'garbage');

    let enumerations = 0;
    const storage = localStorage;
    globalThis.localStorage = new Proxy(storage, {
      get(target, prop, receiver) {
        if (prop === 'length' || prop === 'key') enumerations++;
        return Reflect.get(target, prop, receiver);
      },
    }) as Storage;

    savePageCamera('d1', 'p1', CAM, null);
    expect(enumerations).toBe(0);
    expect(loadPageCamera('d1', 'p1')).not.toBeNull();
  });

  test('a corrupt key is evicted first and the sweep terminates', () => {
    localStorage.setItem(keyFor('corrupt'), 'not json at all');
    for (let i = 0; i < MAX_TRACKED_DRAFTS; i++) {
      savePageCamera(`d${i}`, 'p1', CAM, null);
    }
    expect(localStorage.getItem(keyFor('corrupt'))).toBeNull();
    expect(cameraKeyCount()).toBe(MAX_TRACKED_DRAFTS);
  });
});

describe('removal', () => {
  test('removes one entry, and the whole key once it was the last', () => {
    savePageCamera('d1', 'p1', CAM, null);
    savePageCamera('d1', 'p2', CAM, null);

    removePageCamera('d1', 'p1');
    expect(loadPageCamera('d1', 'p1')).toBeNull();
    expect(loadPageCamera('d1', 'p2')).not.toBeNull();

    removePageCamera('d1', 'p2');
    expect(localStorage.getItem(keyFor('d1'))).toBeNull();
  });

  test('removeDraftCameras drops the key', () => {
    savePageCamera('d1', 'p1', CAM, null);
    removeDraftCameras('d1');
    expect(localStorage.getItem(keyFor('d1'))).toBeNull();
  });
});

describe('quota handling', () => {
  function quotaError(): Error {
    const error = new Error('quota');
    error.name = 'QuotaExceededError';
    return error;
  }

  test('frees the stalest draft and retries, without throwing', () => {
    savePageCamera('old', 'p1', CAM, null);
    const record = rawRecord('old')!;
    localStorage.setItem(keyFor('old'), JSON.stringify({ ...record, t: 1 }));
    savePageCamera('newer', 'p1', CAM, null);

    const inner = localStorage;
    let rejectOnce = true;
    globalThis.localStorage = new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'setItem') {
          return (key: string, value: string) => {
            if (rejectOnce && key === keyFor('fresh')) {
              rejectOnce = false;
              throw quotaError();
            }
            target.setItem(key, value);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Storage;

    expect(() => savePageCamera('fresh', 'p1', CAM, null)).not.toThrow();
    expect(inner.getItem(keyFor('old'))).toBeNull(); // stalest freed
    expect(inner.getItem(keyFor('newer'))).not.toBeNull();
    expect(inner.getItem(keyFor('fresh'))).not.toBeNull();
  });

  test('a persistently throwing setItem stays silent', () => {
    globalThis.localStorage = new Proxy(new MemoryStorage(), {
      get(target, prop, receiver) {
        if (prop === 'setItem') {
          return () => {
            throw quotaError();
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Storage;

    expect(() => savePageCamera('d1', 'p1', CAM, null)).not.toThrow();
  });
});

describe('storage unavailable', () => {
  test('every entry point no-ops rather than throwing', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(loadPageCamera('d1', 'p1')).toBeNull();
    expect(() => savePageCamera('d1', 'p1', CAM, null)).not.toThrow();
    expect(() => removePageCamera('d1', 'p1')).not.toThrow();
    expect(() => removeDraftCameras('d1')).not.toThrow();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: new MemoryStorage(),
    });
  });
});

describe('toRestoredCamera', () => {
  test('preserves the world point at the viewport centre across a resize', () => {
    const stored = { x: -500, y: -400, zoom: 2, vw: 1000, vh: 800, t: 0 };
    const restored = toRestoredCamera(stored, { width: 1400, height: 900 });

    const worldCx = (1000 / 2 - -500) / 2;
    const worldCy = (800 / 2 - -400) / 2;
    expect(restored.x).toBeCloseTo(1400 / 2 - worldCx * 2, 10);
    expect(restored.y).toBeCloseTo(900 / 2 - worldCy * 2, 10);
    expect(restored.zoom).toBe(2);
  });

  test('passes through when the viewport is unchanged, missing or degenerate', () => {
    const stored = { x: -500, y: -400, zoom: 2, vw: 1000, vh: 800, t: 0 };
    expect(toRestoredCamera(stored, { width: 1000, height: 800 })).toEqual({
      x: -500,
      y: -400,
      zoom: 2,
    });
    expect(toRestoredCamera(stored, { width: 0, height: 0 }).x).toBe(-500);
    expect(toRestoredCamera({ x: 1, y: 2, zoom: 1, t: 0 }, { width: 900, height: 900 })).toEqual({
      x: 1,
      y: 2,
      zoom: 1,
    });
  });

  test('clamps the restored zoom', () => {
    expect(toRestoredCamera({ x: 0, y: 0, zoom: 5000, t: 0 }, null).zoom).toBe(256);
  });
});
