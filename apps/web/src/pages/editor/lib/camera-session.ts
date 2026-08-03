import type * as Y from 'yjs';
import type { Camera } from '@draftila/shared';
import { getActivePageId } from '@draftila/engine';
import { DEFAULT_CAMERA } from '@draftila/engine/camera';
import {
  loadPageCamera,
  sanitizeViewport,
  savePageCamera,
  toRestoredCamera,
  type ViewportSize,
} from '../../../lib/camera-storage';
import { useEditorStore } from '../../../stores/editor-store';
import { computeFitCamera, getCanvasViewportRect } from './fit-camera';

const SAVE_DEBOUNCE_MS = 500;

function defaultGetViewport(): ViewportSize | null {
  return sanitizeViewport(getCanvasViewportRect());
}

export interface CameraSessionOptions {
  draftId: string;
  ydoc: Y.Doc;
  /** Injected so tests never need a DOM. */
  getViewport?: () => ViewportSize | null;
}

export interface CameraSession {
  /** Page id is derived internally from engine truth; (re)arms the trailing timer. */
  record(camera: Camera): void;
  /** Clears the timer and writes all pending entries. Touches neither the DOM nor the doc. */
  flush(): void;
  dispose(): void;
}

interface InternalCameraSession extends CameraSession {
  drop(pageId: string): void;
}

interface PendingEntry {
  camera: Camera;
  viewport: ViewportSize | null;
}

let currentSession: InternalCameraSession | null = null;

/**
 * Identity marker for cameras this module applied, so the store subscription can
 * tell a restore from genuine user movement. It must never alias a shared
 * constant: DEFAULT_CAMERA is also the store's initial value, so aliasing it
 * would swallow every future `setCamera(DEFAULT_CAMERA)` forever.
 */
let lastApplied: Camera | null = null;

/**
 * Drives both "already applied here, skip" and the 'fit'-vs-'default' choice.
 * `ydoc` is part of the key because version restore rebuilds the doc under the
 * same draftId with the same page ids — a (draftId, pageId) key would survive
 * that swap and wrongly skip. `pageId` is nullable so the preview-exit contract
 * can clear the page marker while keeping the (draftId, ydoc) context.
 */
let lastAppliedKey: { draftId: string; ydoc: Y.Doc; pageId: string | null } | null = null;

export function createCameraSession(opts: CameraSessionOptions): CameraSession {
  const { draftId, ydoc } = opts;
  const getViewport = opts.getViewport ?? defaultGetViewport;
  const pending = new Map<string, PendingEntry>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  const session: InternalCameraSession = {
    record(camera) {
      if (camera === lastApplied) return;

      // Engine truth, never the store: with the left panel closed the store's
      // activePageId can stay pinned to a previous draft's page for a whole
      // session, which would silently persist nothing.
      const pageId = getActivePageId(ydoc);
      if (!pageId) return;

      const viewport = getViewport();
      pending.set(pageId, {
        camera,
        // A transient null (canvas mid-layout) must not erase a good reading.
        viewport: viewport ?? pending.get(pageId)?.viewport ?? null,
      });

      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        session.flush();
      }, SAVE_DEBOUNCE_MS);
    },

    flush() {
      clearTimer();
      if (pending.size === 0) return;
      for (const [pageId, entry] of pending) {
        savePageCamera(draftId, pageId, entry.camera, entry.viewport);
      }
      pending.clear();
    },

    drop(pageId) {
      pending.delete(pageId);
    },

    dispose() {
      session.flush();
      // Only the live session may clear the slot; an unconditional clear would
      // let a stale cleanup silence all future saves.
      if (currentSession === session) currentSession = null;
    },
  };

  currentSession?.dispose();
  currentSession = session;
  return session;
}

export function flushPendingCameraSaves(): void {
  currentSession?.flush();
}

/** Discard a pending entry without writing it (page deletion). */
export function dropPendingCameraSave(pageId: string): void {
  currentSession?.drop(pageId);
}

/** Injection seam so tests need no DOM. */
export interface CameraApplyDeps {
  getViewport?: () => ViewportSize | null;
  computeFit?: (ydoc: Y.Doc) => Camera | null;
}

export function applyCameraForPage(
  draftId: string,
  pageId: string,
  fallback: 'fit' | 'default',
  ydoc: Y.Doc,
  deps: CameraApplyDeps = {},
): void {
  const getViewport = deps.getViewport ?? defaultGetViewport;
  const computeFit = deps.computeFit ?? computeFitCamera;

  // Commit outgoing movement before reading, so switching away and back within
  // the debounce window restores the panned position rather than a stale one.
  flushPendingCameraSaves();

  const stored = loadPageCamera(draftId, pageId);
  const camera: Camera = stored
    ? toRestoredCamera(stored, getViewport())
    : fallback === 'fit'
      ? (computeFit(ydoc) ?? { ...DEFAULT_CAMERA })
      : { ...DEFAULT_CAMERA };

  lastApplied = camera;
  lastAppliedKey = { draftId, ydoc, pageId };
  useEditorStore.getState().setCamera(camera);
}

export function isCameraAppliedFor(draftId: string, pageId: string, ydoc: Y.Doc): boolean {
  return (
    lastAppliedKey !== null &&
    lastAppliedKey.draftId === draftId &&
    lastAppliedKey.ydoc === ydoc &&
    lastAppliedKey.pageId === pageId
  );
}

/**
 * Effect-driven page entry: decides skip / 'default' / 'fit' itself, so duplicate
 * triggers (store corrections, StrictMode, reconnects) are free.
 */
export function applyCameraForPageEntry(
  draftId: string,
  pageId: string,
  ydoc: Y.Doc,
  deps?: CameraApplyDeps,
): void {
  if (isCameraAppliedFor(draftId, pageId, ydoc)) return;

  const sameContext =
    lastAppliedKey !== null && lastAppliedKey.draftId === draftId && lastAppliedKey.ydoc === ydoc;

  applyCameraForPage(draftId, pageId, sameContext ? 'default' : 'fit', ydoc, deps);
}

/**
 * Clears the applied-page marker while preserving the (draftId, ydoc) context, so
 * the next entry re-applies with 'default' semantics instead of skipping. Used on
 * preview exit: without it, a camera panned to inside preview would silently
 * become the live session's camera.
 */
export function invalidateCameraApplyKey(): void {
  if (lastAppliedKey === null) return;
  lastAppliedKey = { ...lastAppliedKey, pageId: null };
}
