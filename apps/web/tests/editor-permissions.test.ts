import { beforeEach, describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { addShape, ensureDefaultPage, initDocument } from '@draftila/engine';
import type { ToolType } from '@draftila/shared';
import { saveSessionThumbnail } from '../src/pages/editor/lib/thumbnail-session';
import { useEditorStore } from '../src/stores/editor-store';
import { isReadOnlyEditor, isReadOnlyTool } from '../src/pages/editor/lib/editor-permissions';
import { handleReadOnlyKeyDown } from '../src/pages/editor/lib/keyboard/handle-read-only';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
});

function keyEvent(key: string, options: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    code: key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {},
    ...options,
  } as KeyboardEvent;
}

describe('editor permissions', () => {
  test('fails closed until authorized and treats snapshots as read-only', () => {
    expect(isReadOnlyEditor(useEditorStore.getState())).toBe(true);
    useEditorStore.getState().setCanEditDocument(true);
    expect(isReadOnlyEditor(useEditorStore.getState())).toBe(false);
    useEditorStore.setState({ previewSnapshotId: 'snapshot' });
    expect(isReadOnlyEditor(useEditorStore.getState())).toBe(true);
  });

  test('viewers retain selection, navigation, and comments but cannot start edit interactions', () => {
    for (const tool of ['move', 'hand', 'comment'] as const) {
      expect(isReadOnlyTool(tool)).toBe(true);
      useEditorStore.getState().setActiveTool(tool);
      expect(useEditorStore.getState().activeTool).toBe(tool);
    }
    for (const tool of [
      'rectangle',
      'ellipse',
      'frame',
      'text',
      'pen',
      'node',
    ] satisfies ToolType[]) {
      expect(isReadOnlyTool(tool)).toBe(false);
      useEditorStore.getState().setActiveTool(tool);
      expect(useEditorStore.getState().activeTool).toBe('comment');
    }
    useEditorStore.getState().setEditingTextId('text');
    useEditorStore.getState().setSaveVersionDialogOpen(true);
    expect(useEditorStore.getState().editingTextId).toBeNull();
    expect(useEditorStore.getState().saveVersionDialogOpen).toBe(false);
  });

  test('revocation cancels active editing and closes version creation', () => {
    const store = useEditorStore.getState();
    store.setCanEditDocument(true);
    store.setActiveTool('text');
    store.setEditingTextId('text');
    store.setSaveVersionDialogOpen(true);
    useEditorStore.setState({ isDrawing: true });
    store.setCanEditDocument(false);
    expect(useEditorStore.getState()).toMatchObject({
      canEditDocument: false,
      activeTool: 'move',
      editingTextId: null,
      isDrawing: false,
      draggingGuide: null,
      saveVersionDialogOpen: false,
    });
  });

  test('read-only keyboard commands cannot change the Yjs document', () => {
    const doc = new Y.Doc();
    initDocument(doc);
    ensureDefaultPage(doc);
    const id = addShape(doc, 'rectangle', { x: 10, y: 20 });
    useEditorStore.getState().setSelectedIds([id]);
    const before = Y.encodeStateAsUpdate(doc);
    for (const key of [
      'Delete',
      'Backspace',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      'r',
      't',
      'p',
      'f',
    ]) {
      handleReadOnlyKeyDown(keyEvent(key), doc);
    }
    for (const key of ['z', 'x', 'v', 'd', 'g', 's']) {
      handleReadOnlyKeyDown(keyEvent(key, { ctrlKey: true }), doc);
      handleReadOnlyKeyDown(keyEvent(key, { metaKey: true, shiftKey: true }), doc);
    }
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    expect(useEditorStore.getState().selectedIds).toEqual([id]);
    expect(useEditorStore.getState().saveVersionDialogOpen).toBe(false);
    handleReadOnlyKeyDown(keyEvent('Escape'), doc);
    expect(useEditorStore.getState().selectedIds).toEqual([]);
    handleReadOnlyKeyDown(keyEvent('a', { ctrlKey: true }), doc);
    expect(useEditorStore.getState().selectedIds).toEqual([id]);
    handleReadOnlyKeyDown(keyEvent('h'), doc);
    expect(useEditorStore.getState().activeTool).toBe('hand');
    handleReadOnlyKeyDown(keyEvent('c'), doc);
    expect(useEditorStore.getState().activeTool).toBe('comment');
    handleReadOnlyKeyDown(keyEvent('+', { ctrlKey: true }), doc);
    expect(useEditorStore.getState().camera.zoom).toBe(1.25);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    doc.destroy();
  });
});

describe('thumbnail session authorization', () => {
  test('normal connection teardown does not revoke the captured editor session', async () => {
    useEditorStore.getState().setCanEditDocument(true);
    const session = {
      draftId: 'edited-draft',
      ydoc: new Y.Doc(),
      synced: true,
      canEdit: useEditorStore.getState().canEditDocument,
    };
    useEditorStore.getState().setCanEditDocument(false);
    const saved: string[] = [];
    await saveSessionThumbnail(
      session,
      async () => new Blob(['thumbnail']),
      async (draftId) => {
        saved.push(draftId);
      },
    );
    expect(saved).toEqual(['edited-draft']);
    session.ydoc.destroy();
  });

  test('viewer, revoked, and unsynced sessions never generate or upload thumbnails', async () => {
    const doc = new Y.Doc();
    for (const state of [
      { synced: true, canEdit: false },
      { synced: false, canEdit: true },
    ]) {
      let generated = false;
      let saved = false;
      await saveSessionThumbnail(
        { draftId: 'draft', ydoc: doc, ...state },
        async () => {
          generated = true;
          return new Blob();
        },
        async () => {
          saved = true;
        },
      );
      expect(generated).toBe(false);
      expect(saved).toBe(false);
    }
    doc.destroy();
  });
});
