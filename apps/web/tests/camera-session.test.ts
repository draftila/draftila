import { describe, expect, test, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import { addPage, removePage, setActivePage } from '@draftila/engine';
import { DEFAULT_CAMERA } from '@draftila/engine/camera';
import {
  applyCameraForPage,
  applyCameraForPageEntry,
  createCameraSession,
  dropPendingCameraSave,
  invalidateCameraApplyKey,
  type CameraApplyDeps,
  type CameraSession,
} from '../src/pages/editor/lib/camera-session';
import { loadPageCamera } from '../src/lib/camera-storage';
import { useEditorStore } from '../src/stores/editor-store';
import { MemoryStorage } from './setup';

const VIEWPORT = { width: 1200, height: 800 };

/** Deps that never touch the DOM. `computeFit` counts calls so tests can assert the branch taken. */
function makeDeps(fit: { x: number; y: number; zoom: number } | null = null) {
  const calls = { computeFit: 0 };
  const deps: CameraApplyDeps = {
    getViewport: () => VIEWPORT,
    computeFit: () => {
      calls.computeFit++;
      return fit ? { ...fit } : null;
    },
  };
  return { deps, calls };
}

/**
 * The production wiring lives in the hook, so each test reproduces it: record()
 * is only ever reached through this subscription.
 */
function wire(session: CameraSession): () => void {
  return useEditorStore.subscribe((state, prev) => {
    if (state.camera === prev.camera) return;
    if (state.previewSnapshotId) return;
    session.record(state.camera);
  });
}

/** `addPage` rather than `ensureDefaultPage`: the latter reads nested types before
 *  integrating them, which makes Yjs log a warning on every call. */
function makeDoc(): { ydoc: Y.Doc; pageId: string } {
  const ydoc = new Y.Doc();
  const pageId = addPage(ydoc);
  setActivePage(ydoc, pageId);
  return { ydoc, pageId };
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  // Reset the module-level apply key by applying into a throwaway context.
  const { ydoc, pageId } = makeDoc();
  applyCameraForPage('__reset__', pageId, 'default', ydoc, makeDeps().deps);
  useEditorStore.getState().setActivePageId(null);
});

describe('identity suppression', () => {
  test('an applied camera is not recorded, but an external one is', () => {
    const { ydoc, pageId } = makeDoc();
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    applyCameraForPage('d1', pageId, 'default', ydoc, makeDeps().deps);
    session.flush();
    expect(loadPageCamera('d1', pageId)).toBeNull();

    useEditorStore.getState().setCamera({ x: 7, y: 8, zoom: 3 });
    session.flush();
    expect(loadPageCamera('d1', pageId)?.x).toBe(7);

    unsubscribe();
    session.dispose();
  });

  test('repeated default fallbacks never poison the shared DEFAULT_CAMERA constant', () => {
    const { ydoc, pageId } = makeDoc();
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    for (let i = 0; i < 3; i++) {
      applyCameraForPage('d1', pageId, 'default', ydoc, makeDeps().deps);
    }

    // A genuine user action that happens to land on the default camera.
    useEditorStore.getState().setCamera({ ...DEFAULT_CAMERA });
    session.flush();

    const stored = loadPageCamera('d1', pageId);
    expect(stored).not.toBeNull();
    expect(stored?.zoom).toBe(DEFAULT_CAMERA.zoom);

    unsubscribe();
    session.dispose();
  });
});

describe('entry logic', () => {
  test('a fresh context fits; null fit falls back to the default camera by value', () => {
    const { ydoc, pageId } = makeDoc();
    const { deps, calls } = makeDeps();

    applyCameraForPageEntry('d1', pageId, ydoc, deps);

    expect(calls.computeFit).toBe(1);
    const camera = useEditorStore.getState().camera;
    expect(camera).toEqual(DEFAULT_CAMERA);
    expect(camera).not.toBe(DEFAULT_CAMERA);
  });

  test('a new page in the same context uses default, not fit', () => {
    const { ydoc, pageId } = makeDoc();
    const second = addPage(ydoc);

    applyCameraForPageEntry('d1', pageId, ydoc, makeDeps({ x: 1, y: 1, zoom: 4 }).deps);

    const { deps, calls } = makeDeps({ x: 1, y: 1, zoom: 4 });
    applyCameraForPageEntry('d1', second, ydoc, deps);

    expect(calls.computeFit).toBe(0);
    expect(useEditorStore.getState().camera).toEqual(DEFAULT_CAMERA);
  });

  test('an exact repeat is skipped', () => {
    const { ydoc, pageId } = makeDoc();
    applyCameraForPageEntry('d1', pageId, ydoc, makeDeps({ x: 5, y: 5, zoom: 2 }).deps);
    const applied = useEditorStore.getState().camera;

    const { deps, calls } = makeDeps({ x: 9, y: 9, zoom: 9 });
    applyCameraForPageEntry('d1', pageId, ydoc, deps);

    expect(calls.computeFit).toBe(0);
    expect(useEditorStore.getState().camera).toBe(applied);
  });

  test('the same draft with a new doc fits again (version restore)', () => {
    const first = makeDoc();
    applyCameraForPageEntry('d1', first.pageId, first.ydoc, makeDeps({ x: 1, y: 1, zoom: 2 }).deps);

    // Version restore rebuilds the doc under the same draftId, preserving page ids.
    const restored = new Y.Doc();
    const restoredPageId = addPage(restored);
    setActivePage(restored, restoredPageId);

    const { deps, calls } = makeDeps({ x: 3, y: 3, zoom: 5 });
    applyCameraForPageEntry('d1', restoredPageId, restored, deps);

    expect(calls.computeFit).toBe(1);
    expect(useEditorStore.getState().camera).toEqual({ x: 3, y: 3, zoom: 5 });
  });

  test('after invalidation an exact repeat re-applies with default, not fit', () => {
    const { ydoc, pageId } = makeDoc();
    applyCameraForPageEntry('d1', pageId, ydoc, makeDeps({ x: 1, y: 1, zoom: 2 }).deps);

    // Stands in for a pan made inside version preview.
    useEditorStore.getState().setCamera({ x: 999, y: 999, zoom: 9 });

    invalidateCameraApplyKey();

    const { deps, calls } = makeDeps({ x: 4, y: 4, zoom: 4 });
    applyCameraForPageEntry('d1', pageId, ydoc, deps);

    expect(calls.computeFit).toBe(0); // 'default', not 'fit'
    expect(useEditorStore.getState().camera).toEqual(DEFAULT_CAMERA); // preview pan discarded
  });
});

describe('recording', () => {
  test('uses engine truth for the page id, not the store', () => {
    const { ydoc, pageId } = makeDoc();
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    // The store id can stay pinned to a previous draft's page for a whole session.
    useEditorStore.getState().setActivePageId('stale-page-from-another-draft');

    useEditorStore.getState().setCamera({ x: 42, y: 43, zoom: 1 });
    session.flush();

    expect(loadPageCamera('d1', pageId)?.x).toBe(42);
    expect(loadPageCamera('d1', 'stale-page-from-another-draft')).toBeNull();

    unsubscribe();
    session.dispose();
  });

  test('captures the viewport per record and ignores transient nulls', () => {
    const { ydoc, pageId } = makeDoc();
    let viewport: { width: number; height: number } | null = { width: 1200, height: 800 };
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => viewport });
    const unsubscribe = wire(session);

    useEditorStore.getState().setCamera({ x: 1, y: 1, zoom: 1 });

    viewport = null; // canvas mid-layout
    useEditorStore.getState().setCamera({ x: 2, y: 2, zoom: 1 });
    session.flush();
    expect(loadPageCamera('d1', pageId)?.vw).toBe(1200);

    viewport = { width: 1440, height: 800 }; // left panel toggled
    useEditorStore.getState().setCamera({ x: 3, y: 3, zoom: 1 });
    session.flush();
    expect(loadPageCamera('d1', pageId)?.vw).toBe(1440);

    unsubscribe();
    session.dispose();
  });
});

describe('flush semantics', () => {
  test('flush drains the map and clears the timer', async () => {
    const { ydoc, pageId } = makeDoc();
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    useEditorStore.getState().setCamera({ x: 11, y: 11, zoom: 1 });
    session.flush();
    expect(loadPageCamera('d1', pageId)?.x).toBe(11);

    // A surviving timer would fire against an empty map; nothing should change.
    localStorage.clear();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(loadPageCamera('d1', pageId)).toBeNull();

    unsubscribe();
    session.dispose();
  });

  test('applying commits a pending pan before reading (quick switch back)', () => {
    const { ydoc, pageId } = makeDoc();
    const other = addPage(ydoc);
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    // Pan page 1, then switch away and back inside the debounce window.
    useEditorStore.getState().setCamera({ x: 77, y: 78, zoom: 3 });
    setActivePage(ydoc, other);
    applyCameraForPage('d1', other, 'default', ydoc, makeDeps().deps);

    setActivePage(ydoc, pageId);
    applyCameraForPage('d1', pageId, 'default', ydoc, makeDeps().deps);

    expect(useEditorStore.getState().camera.x).toBe(77);

    unsubscribe();
    session.dispose();
  });
});

describe('deletion', () => {
  test('a dropped pending entry is never resurrected by a later flush', () => {
    const { ydoc, pageId } = makeDoc();
    const other = addPage(ydoc);
    const session = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(session);

    useEditorStore.getState().setCamera({ x: 5, y: 5, zoom: 2 });

    removePage(ydoc, pageId);
    dropPendingCameraSave(pageId);

    setActivePage(ydoc, other);
    applyCameraForPage('d1', other, 'default', ydoc, makeDeps().deps); // flushes internally
    session.flush();

    expect(loadPageCamera('d1', pageId)).toBeNull();

    unsubscribe();
    session.dispose();
  });
});

describe('slot ownership', () => {
  test('creating a session disposes the previous one and flushes its pendings', () => {
    const { ydoc, pageId } = makeDoc();
    const first = createCameraSession({ ydoc, draftId: 'd1', getViewport: () => VIEWPORT });
    const unsubscribe = wire(first);

    useEditorStore.getState().setCamera({ x: 21, y: 22, zoom: 1 });
    unsubscribe();

    const second = createCameraSession({ ydoc, draftId: 'd2', getViewport: () => VIEWPORT });
    expect(loadPageCamera('d1', pageId)?.x).toBe(21);

    // A stale dispose must not null the live slot: d2 must still flush.
    first.dispose();
    const unsubscribe2 = wire(second);
    useEditorStore.getState().setCamera({ x: 31, y: 32, zoom: 1 });
    second.flush();
    expect(loadPageCamera('d2', pageId)?.x).toBe(31);

    unsubscribe2();
    second.dispose();
  });
});
