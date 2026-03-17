import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { Check, Diamond, MoreHorizontal, Plus, X } from 'lucide-react';
import {
  createComponent,
  createInstance,
  listComponents,
  observeComponents,
  renameComponent,
  removeComponent,
} from '@draftila/engine';
import { getExpandedShapeIds } from '@draftila/engine/scene-graph';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/stores/editor-store';

interface ComponentsListProps {
  ydoc: Y.Doc;
}

export function ComponentsList({ ydoc }: ComponentsListProps) {
  const [components, setComponents] = useState(() => listComponents(ydoc));
  const [renamingComponentId, setRenamingComponentId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const selectedIds = useEditorStore((s) => s.selectedIds);

  useEffect(() => {
    const update = () => setComponents(listComponents(ydoc));
    update();
    return observeComponents(ydoc, update);
  }, [ydoc]);

  const handleCreateFromSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const nextName = `Component ${components.length + 1}`;
    const expandedIds = getExpandedShapeIds(ydoc, selectedIds);
    const componentId = createComponent(ydoc, expandedIds, nextName);
    if (!componentId) return;
    setComponents(listComponents(ydoc));
  }, [components.length, selectedIds, ydoc]);

  const handleInsert = useCallback(
    (componentId: string) => {
      const { camera } = useEditorStore.getState();
      const x = Math.round((-camera.x + 120) / camera.zoom);
      const y = Math.round((-camera.y + 120) / camera.zoom);
      const newIds = createInstance(ydoc, componentId, x, y);
      if (newIds.length > 0) {
        useEditorStore.getState().setSelectedIds(newIds);
      }
    },
    [ydoc],
  );

  const handleDelete = useCallback(
    (componentId: string) => {
      removeComponent(ydoc, componentId);
      setComponents(listComponents(ydoc));
    },
    [ydoc],
  );

  const startRename = useCallback((componentId: string, currentName: string) => {
    setRenamingComponentId(componentId);
    setRenameValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingComponentId) return;
    const trimmed = renameValue.trim();
    if (trimmed.length > 0) {
      renameComponent(ydoc, renamingComponentId, trimmed);
      setComponents(listComponents(ydoc));
    }
    setRenamingComponentId(null);
    setRenameValue('');
  }, [renameValue, renamingComponentId, ydoc]);

  const cancelRename = useCallback(() => {
    setRenamingComponentId(null);
    setRenameValue('');
  }, []);

  return (
    <div className="border-b px-2 py-2">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
          Components
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          onClick={handleCreateFromSelection}
          disabled={selectedIds.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {components.length === 0 ? (
        <p className="text-muted-foreground px-1 py-1 text-[11px]">No components</p>
      ) : (
        <div className="space-y-1">
          {components.map((component) => (
            <div key={component.id} className="flex items-center gap-1">
              <div className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded">
                <Diamond className="h-3.5 w-3.5" />
              </div>
              {renamingComponentId === component.id ? (
                <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border px-1">
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={commitRename}
                    className="h-5 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commitRename}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs">{component.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleInsert(component.id)}
                  >
                    Insert
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => startRename(component.id, component.name)}>
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onSelect={() => handleDelete(component.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
