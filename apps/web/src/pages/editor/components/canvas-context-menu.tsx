import { forwardRef, useCallback, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { ChevronRight } from 'lucide-react';
import { createComponent, listComponents, removeGuide, removeAllGuides } from '@draftila/engine';
import { copyShapes, copyStyle, hasStyleClipboardContent } from '@draftila/engine/clipboard';
import { handlePaste as handleExternalPaste } from '@draftila/engine/shape-import';
import {
  canApplyBooleanOperation,
  getAllShapes,
  getExpandedShapeIds,
  getSelectedContainer,
  getShape,
} from '@draftila/engine/scene-graph';
import {
  opDeleteShapes,
  opGroupShapes,
  opUngroupShapes,
  opMoveInStack,
  opBooleanOperation,
  opCutShapes,
  opPasteShapes,
  opDuplicateShapesInPlace,
  opPasteStyle,
} from '@draftila/engine/operations';
import { exportToSvg, exportToPng } from '@draftila/engine/export';
import {
  generateCss,
  generateCssAllLayers,
  generateTailwind,
  generateTailwindAllLayers,
  generateSwiftUI,
  generateCompose,
} from '@draftila/engine/codegen';
import type { CodeFormat } from '@draftila/engine/codegen';
import { useEditorStore } from '@/stores/editor-store';

interface CanvasContextMenuProps {
  ydoc: Y.Doc;
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
  onClose: () => void;
}

interface SubMenuState {
  id: string;
  x: number;
  y: number;
}

function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="text-muted-foreground ml-auto pl-4 text-[11px] tracking-wide">{keys}</span>
  );
}

function MenuSeparator() {
  return <div className="bg-border my-1 h-px" />;
}

function MenuItem({
  children,
  onClick,
  disabled,
  shortcut,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2.5 text-[13px] disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex-1 text-left">{children}</span>
      {shortcut && <Shortcut keys={shortcut} />}
    </button>
  );
}

function SubMenuTrigger({
  children,
  onHover,
  isOpen,
}: {
  children: React.ReactNode;
  onHover: (rect: DOMRect) => void;
  isOpen: boolean;
}) {
  return (
    <button
      className={`flex h-8 w-full items-center rounded px-2.5 text-[13px] ${isOpen ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
      onPointerEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onHover(rect);
      }}
    >
      <span className="flex-1 text-left">{children}</span>
      <ChevronRight className="text-muted-foreground ml-auto h-3.5 w-3.5" />
    </button>
  );
}

export const CanvasContextMenu = forwardRef<HTMLDivElement, CanvasContextMenuProps>(
  function CanvasContextMenu({ ydoc, position, canvasPosition, onClose }, ref) {
    const [subMenu, setSubMenu] = useState<SubMenuState | null>(null);
    const [subSubMenu, setSubSubMenu] = useState<SubMenuState | null>(null);

    const selectedIds = useEditorStore((s) => s.selectedIds);
    const editorMode = useEditorStore((s) => s.editorMode);
    const selectedGuideId = useEditorStore((s) => s.selectedGuideId);
    const guides = useEditorStore((s) => s.guides);
    const activePageId = useEditorStore((s) => s.activePageId);
    const hasSelection = selectedIds.length > 0;
    const hasGuides = guides.length > 0;

    const getExportableShapes = useCallback(() => {
      const ids = useEditorStore.getState().selectedIds;
      if (ids.length === 0) return [];
      const expandedIds = new Set(getExpandedShapeIds(ydoc, ids));
      return getAllShapes(ydoc).filter((s) => expandedIds.has(s.id));
    }, [ydoc]);

    const canGroup = selectedIds.length > 1;
    const canBoolean = useMemo(
      () => canApplyBooleanOperation(ydoc, selectedIds),
      [ydoc, selectedIds],
    );
    const canUngroup = useMemo(() => {
      return selectedIds.some((id) => getShape(ydoc, id)?.type === 'group');
    }, [ydoc, selectedIds]);

    const handleCopy = useCallback(() => {
      if (hasSelection) copyShapes(ydoc, selectedIds);
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handlePaste = useCallback(() => {
      const targetParentId = getSelectedContainer(ydoc, selectedIds);

      navigator.clipboard
        .read()
        .then(async (items) => {
          let html: string | null = null;
          let text: string | null = null;
          for (const item of items) {
            if (item.types.includes('text/html')) {
              html = await (await item.getType('text/html')).text();
            }
            if (item.types.includes('text/plain')) {
              text = await (await item.getType('text/plain')).text();
            }
          }
          if (html || text) {
            const newIds = handleExternalPaste(ydoc, html, text, {
              targetParentId,
              cursorPosition: canvasPosition,
            });
            if (newIds.length > 0) {
              useEditorStore.getState().setSelectedIds(newIds);
              return;
            }
          }
          const fallbackIds = opPasteShapes(ydoc, {
            selectedIds,
            cursorPosition: canvasPosition,
          });
          if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
        })
        .catch(() => {
          const fallbackIds = opPasteShapes(ydoc, {
            selectedIds,
            cursorPosition: canvasPosition,
          });
          if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
        });

      onClose();
    }, [ydoc, selectedIds, canvasPosition, onClose]);

    const handleCut = useCallback(() => {
      if (hasSelection) {
        opCutShapes(ydoc, selectedIds);
        useEditorStore.getState().clearSelection();
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handleDuplicate = useCallback(() => {
      if (hasSelection) {
        const idMap = opDuplicateShapesInPlace(ydoc, selectedIds);
        const newIds = [...idMap.values()];
        useEditorStore.getState().setSelectedIds(newIds);
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handleCopyStyle = useCallback(() => {
      if (hasSelection) {
        const sourceId = selectedIds[0];
        if (sourceId) {
          copyStyle(ydoc, sourceId);
        }
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handlePasteStyle = useCallback(() => {
      if (hasSelection && hasStyleClipboardContent()) {
        opPasteStyle(ydoc, selectedIds);
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handleDelete = useCallback(() => {
      if (hasSelection) {
        opDeleteShapes(ydoc, selectedIds);
        useEditorStore.getState().clearSelection();
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handleGroup = useCallback(() => {
      const groupId = opGroupShapes(ydoc, selectedIds);
      if (groupId) {
        useEditorStore.getState().setSelectedIds([groupId]);
        useEditorStore.getState().setEnteredGroupId(null);
      }
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleCreateComponent = useCallback(() => {
      if (!hasSelection) {
        onClose();
        return;
      }
      const expandedIds = getExpandedShapeIds(ydoc, selectedIds);
      const nextName = `Component ${listComponents(ydoc).length + 1}`;
      const componentId = createComponent(ydoc, expandedIds, nextName);
      if (componentId) {
        useEditorStore.getState().setSelectedIds(selectedIds);
      }
      onClose();
    }, [ydoc, selectedIds, hasSelection, onClose]);

    const handleUngroup = useCallback(() => {
      const childIds = opUngroupShapes(ydoc, selectedIds);
      if (childIds.length > 0) {
        useEditorStore.getState().setSelectedIds(childIds);
        useEditorStore.getState().setEnteredGroupId(null);
      }
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleBooleanOperation = useCallback(
      (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => {
        if (!canBoolean) {
          onClose();
          return;
        }
        const newId = opBooleanOperation(ydoc, selectedIds, operation);
        if (newId) {
          useEditorStore.getState().setSelectedIds([newId]);
        }
        onClose();
      },
      [canBoolean, ydoc, selectedIds, onClose],
    );

    const handleBringToFront = useCallback(() => {
      const ids = opMoveInStack(ydoc, selectedIds, 'front');
      if (ids.length > 0) useEditorStore.getState().setSelectedIds(ids);
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleBringForward = useCallback(() => {
      const ids = opMoveInStack(ydoc, selectedIds, 'forward');
      if (ids.length > 0) useEditorStore.getState().setSelectedIds(ids);
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleSendBackward = useCallback(() => {
      const ids = opMoveInStack(ydoc, selectedIds, 'backward');
      if (ids.length > 0) useEditorStore.getState().setSelectedIds(ids);
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleSendToBack = useCallback(() => {
      const ids = opMoveInStack(ydoc, selectedIds, 'back');
      if (ids.length > 0) useEditorStore.getState().setSelectedIds(ids);
      onClose();
    }, [ydoc, selectedIds, onClose]);

    const handleCopyAsSvg = useCallback(async () => {
      const shapes = getExportableShapes();
      if (shapes.length === 0) return;
      const svg = exportToSvg(shapes);
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([svg], { type: 'text/html' }),
            'text/plain': new Blob([svg], { type: 'text/plain' }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(svg);
      }
      onClose();
    }, [getExportableShapes, onClose]);

    const handleCopyAsPng = useCallback(async () => {
      const shapes = getExportableShapes();
      if (shapes.length === 0) return;
      try {
        const blob = await exportToPng(shapes, 2);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch {
        // PNG clipboard may not be supported
      }
      onClose();
    }, [getExportableShapes, onClose]);

    const handleCopyAsCode = useCallback(
      async (format: CodeFormat) => {
        const shapes = getExportableShapes();
        if (shapes.length === 0) return;

        let code: string;
        switch (format) {
          case 'css':
            code = generateCss(shapes);
            break;
          case 'css-all-layers':
            code = generateCssAllLayers(shapes);
            break;
          case 'tailwind':
            code = generateTailwind(shapes);
            break;
          case 'tailwind-all-layers':
            code = generateTailwindAllLayers(shapes);
            break;
          case 'swiftui':
            code = generateSwiftUI(shapes);
            break;
          case 'compose':
            code = generateCompose(shapes);
            break;
          default:
            return;
        }

        await navigator.clipboard.writeText(code);
        onClose();
      },
      [getExportableShapes, onClose],
    );

    const openCopyPasteAsSubmenu = useCallback((rect: DOMRect) => {
      setSubMenu({ id: 'copy-paste-as', x: rect.right, y: rect.top });
      setSubSubMenu(null);
    }, []);

    const openCopyAsCodeSubmenu = useCallback((rect: DOMRect) => {
      setSubSubMenu({ id: 'copy-as-code', x: rect.right, y: rect.top });
    }, []);

    const openBooleanSubmenu = useCallback(
      (rect: DOMRect) => {
        if (!canBoolean) return;
        setSubMenu({ id: 'boolean', x: rect.right, y: rect.top });
      },
      [canBoolean],
    );

    const isMac = navigator.platform.includes('Mac');
    const mod = isMac ? '\u2318' : 'Ctrl+';

    if (editorMode === 'dev') {
      return (
        <div ref={ref}>
          <div
            className="bg-popover text-popover-foreground fixed z-50 min-w-52 rounded-md border p-1 shadow-lg"
            style={{ left: position.x, top: position.y }}
          >
            <MenuItem onClick={handleCopy} disabled={!hasSelection} shortcut={`${mod}C`}>
              Copy
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={handleCopyAsSvg} disabled={!hasSelection}>
              Copy as SVG
            </MenuItem>
            <MenuItem onClick={handleCopyAsPng} disabled={!hasSelection}>
              Copy as PNG
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => handleCopyAsCode('css')} disabled={!hasSelection}>
              Copy CSS
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('css-all-layers')} disabled={!hasSelection}>
              Copy CSS (all layers)
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('tailwind')} disabled={!hasSelection}>
              Copy Tailwind
            </MenuItem>
            <MenuItem
              onClick={() => handleCopyAsCode('tailwind-all-layers')}
              disabled={!hasSelection}
            >
              Copy Tailwind (all layers)
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('swiftui')} disabled={!hasSelection}>
              Copy SwiftUI
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('compose')} disabled={!hasSelection}>
              Copy Compose
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                const allShapes = getAllShapes(ydoc);
                useEditorStore.getState().setSelectedIds(allShapes.map((s) => s.id));
                onClose();
              }}
              shortcut={`${mod}A`}
            >
              Select all
            </MenuItem>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref}>
        <div
          className="bg-popover text-popover-foreground fixed z-50 min-w-52 rounded-md border p-1 shadow-lg"
          style={{ left: position.x, top: position.y }}
        >
          <MenuItem onClick={handleCopy} disabled={!hasSelection} shortcut={`${mod}C`}>
            Copy
          </MenuItem>
          <MenuItem onClick={handlePaste}>Paste here</MenuItem>
          <MenuItem onClick={handleCut} disabled={!hasSelection} shortcut={`${mod}X`}>
            Cut
          </MenuItem>
          <MenuItem onClick={handleDuplicate} disabled={!hasSelection} shortcut={`${mod}D`}>
            Duplicate
          </MenuItem>
          <MenuItem
            onClick={handleCopyStyle}
            disabled={!hasSelection}
            shortcut={isMac ? '\u2325\u2318C' : 'Ctrl+Alt+C'}
          >
            Copy style
          </MenuItem>
          <MenuItem
            onClick={handlePasteStyle}
            disabled={!hasSelection || !hasStyleClipboardContent()}
            shortcut={isMac ? '\u2325\u2318V' : 'Ctrl+Alt+V'}
          >
            Paste style
          </MenuItem>
          <MenuItem
            onClick={handleDelete}
            disabled={!hasSelection}
            shortcut={isMac ? '\u232B' : 'Del'}
          >
            Delete
          </MenuItem>

          <MenuSeparator />

          <SubMenuTrigger onHover={openCopyPasteAsSubmenu} isOpen={subMenu?.id === 'copy-paste-as'}>
            Copy/Paste as
          </SubMenuTrigger>

          <MenuSeparator />

          <SubMenuTrigger onHover={openBooleanSubmenu} isOpen={subMenu?.id === 'boolean'}>
            Boolean
          </SubMenuTrigger>

          <MenuItem onClick={handleBringToFront} disabled={!hasSelection} shortcut="]">
            Bring to front
          </MenuItem>
          <MenuItem onClick={handleBringForward} disabled={!hasSelection}>
            Bring forward
          </MenuItem>
          <MenuItem onClick={handleSendBackward} disabled={!hasSelection}>
            Send backward
          </MenuItem>
          <MenuItem onClick={handleSendToBack} disabled={!hasSelection} shortcut="[">
            Send to back
          </MenuItem>

          <MenuSeparator />

          <MenuItem onClick={handleGroup} disabled={!canGroup} shortcut={`${mod}G`}>
            Group selection
          </MenuItem>
          <MenuItem
            onClick={handleUngroup}
            disabled={!canUngroup}
            shortcut={isMac ? '\u21E7\u2318G' : 'Ctrl+Shift+G'}
          >
            Ungroup
          </MenuItem>
          <MenuItem onClick={handleCreateComponent} disabled={!hasSelection}>
            Create component
          </MenuItem>

          {(selectedGuideId || hasGuides) && <MenuSeparator />}

          {selectedGuideId && activePageId && (
            <MenuItem
              onClick={() => {
                removeGuide(ydoc, activePageId, selectedGuideId);
                useEditorStore.getState().setSelectedGuideId(null);
                onClose();
              }}
            >
              Delete guide
            </MenuItem>
          )}

          {hasGuides && activePageId && (
            <MenuItem
              onClick={() => {
                removeAllGuides(ydoc, activePageId);
                useEditorStore.getState().setSelectedGuideId(null);
                onClose();
              }}
            >
              Remove all guides
            </MenuItem>
          )}
        </div>

        {subMenu?.id === 'copy-paste-as' && (
          <div
            className="bg-popover text-popover-foreground fixed z-50 min-w-48 rounded-md border p-1 shadow-lg"
            style={{ left: subMenu.x + 2, top: subMenu.y }}
          >
            <SubMenuTrigger
              onHover={openCopyAsCodeSubmenu}
              isOpen={subSubMenu?.id === 'copy-as-code'}
            >
              Copy as code
            </SubMenuTrigger>
            <MenuItem onClick={handleCopyAsSvg} disabled={!hasSelection}>
              Copy as SVG
            </MenuItem>
            <MenuItem
              onClick={handleCopyAsPng}
              disabled={!hasSelection}
              shortcut={isMac ? '\u21E7\u2318C' : 'Ctrl+Shift+C'}
            >
              Copy as PNG
            </MenuItem>
          </div>
        )}

        {subSubMenu?.id === 'copy-as-code' && (
          <div
            className="bg-popover text-popover-foreground fixed z-50 min-w-44 rounded-md border p-1 shadow-lg"
            style={{ left: subSubMenu.x + 2, top: subSubMenu.y }}
          >
            <MenuItem onClick={() => handleCopyAsCode('css')} disabled={!hasSelection}>
              CSS
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('css-all-layers')} disabled={!hasSelection}>
              CSS (all layers)
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('tailwind')} disabled={!hasSelection}>
              Tailwind
            </MenuItem>
            <MenuItem
              onClick={() => handleCopyAsCode('tailwind-all-layers')}
              disabled={!hasSelection}
            >
              Tailwind (all layers)
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('swiftui')} disabled={!hasSelection}>
              iOS (SwiftUI)
            </MenuItem>
            <MenuItem onClick={() => handleCopyAsCode('compose')} disabled={!hasSelection}>
              Android (Compose)
            </MenuItem>
          </div>
        )}

        {subMenu?.id === 'boolean' && (
          <div
            className="bg-popover text-popover-foreground fixed z-50 min-w-44 rounded-md border p-1 shadow-lg"
            style={{ left: subMenu.x + 2, top: subMenu.y }}
          >
            <MenuItem onClick={() => handleBooleanOperation('union')} disabled={!canBoolean}>
              Union Selection
            </MenuItem>
            <MenuItem onClick={() => handleBooleanOperation('subtract')} disabled={!canBoolean}>
              Subtract Selection
            </MenuItem>
            <MenuItem onClick={() => handleBooleanOperation('intersect')} disabled={!canBoolean}>
              Intersect Selection
            </MenuItem>
            <MenuItem onClick={() => handleBooleanOperation('exclude')} disabled={!canBoolean}>
              Exclude Selection
            </MenuItem>
          </div>
        )}
      </div>
    );
  },
);
