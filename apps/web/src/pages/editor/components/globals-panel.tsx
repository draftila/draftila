import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { Palette, Plus, Trash2, Type, X } from 'lucide-react';
import {
  countVariableUsage,
  createVariable,
  deleteVariable,
  renameVariable,
  setVariableValue,
} from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';
import { InlineEditableText } from '@/components/inline-editable-text';
import { Button } from '@/components/ui/button';
import { ColorPicker } from './color-picker';
import { useVariables } from '../hooks/use-variables';

const DEFAULT_NEW_COLOR = '#6C3CE9';

/**
 * Draft-scoped design globals.
 *
 * An overlay rather than a right-panel takeover: globals belong to the document,
 * not to the current selection, and the left rail is where typography and other
 * token types will land.
 */
export function GlobalsPanel({ ydoc }: { ydoc: Y.Doc }) {
  const open = useEditorStore((s) => s.globalsOpen);
  const setOpen = useEditorStore((s) => s.setGlobalsOpen);
  // Editing while previewing a snapshot would write to the wrong document:
  // the preview swaps in its own Y.Doc but the undo manager tracks the live one.
  const isPreview = useEditorStore((s) => s.previewSnapshotId !== null);
  const { variables } = useVariables();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, setOpen]);

  const handleAdd = useCallback(() => {
    const taken = new Set(variables.map((v) => v.name));
    let name = 'New color';
    let n = 2;
    while (taken.has(name)) name = `New color ${n++}`;
    createVariable(ydoc, name, DEFAULT_NEW_COLOR);
  }, [ydoc, variables]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-background flex h-[560px] w-[720px] max-w-[92vw] overflow-hidden rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="bg-muted/30 flex w-44 shrink-0 flex-col border-r p-2">
          <p className="text-muted-foreground px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide">
            Globals
          </p>
          <button className="bg-accent text-accent-foreground flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] font-medium">
            <Palette className="h-3.5 w-3.5" />
            Colors
          </button>
          <button
            disabled
            className="text-muted-foreground/60 flex cursor-not-allowed items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]"
          >
            <Type className="h-3.5 w-3.5" />
            Typography
            <span className="bg-muted ml-auto rounded px-1 py-0.5 text-[9px]">Soon</span>
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <h2 className="text-sm font-medium">Colors</h2>
            <span className="text-muted-foreground text-[11px]">
              {variables.length} {variables.length === 1 ? 'global' : 'globals'}
            </span>
            <div className="flex-1" />
            {!isPreview && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Close globals"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isPreview && (
              <p className="text-muted-foreground mb-2 px-2 text-[11px]">
                Viewing a snapshot — globals are read-only.
              </p>
            )}
            {variables.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center">
                <Palette className="h-6 w-6 opacity-40" />
                <p className="text-[12px]">No global colors yet.</p>
                <p className="max-w-[280px] text-[11px] leading-snug">
                  Add one, then bind it from any color picker. Changing it updates every layer
                  that uses it.
                </p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {variables.map((variable) => (
                  <VariableRow
                    key={variable.id}
                    ydoc={ydoc}
                    variable={variable}
                    readOnly={isPreview}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VariableRow({
  ydoc,
  variable,
  readOnly,
}: {
  ydoc: Y.Doc;
  variable: { id: string; name: string; value: string };
  readOnly: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Counted lazily on intent: the walk covers every page and component.
  const [usage, setUsage] = useState(0);

  const startDelete = () => {
    setUsage(countVariableUsage(ydoc, variable.id));
    setConfirmingDelete(true);
  };

  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 rounded px-2 py-1.5">
      <ColorPicker
        color={variable.value}
        opacity={1}
        // A global has no binding of its own, so no Globals strip here.
        showGlobals={false}
        onChange={(color) => setVariableValue(ydoc, variable.id, color)}
        onOpacityChange={() => {}}
      >
        <button
          disabled={readOnly}
          className="border-border h-7 w-7 shrink-0 rounded border disabled:cursor-not-allowed"
          style={{ backgroundColor: variable.value }}
          aria-label={`Edit ${variable.name}`}
        />
      </ColorPicker>

      <div className="min-w-0 flex-1">
        {readOnly ? (
          <span className="block truncate text-[12px]">{variable.name}</span>
        ) : (
          <InlineEditableText
            value={variable.name}
            onSave={(name) => renameVariable(ydoc, variable.id, name)}
            className="block truncate text-[12px]"
            inputClassName="w-full text-[12px]"
          />
        )}
      </div>

      <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
        {variable.value.toUpperCase()}
      </span>

      {!readOnly &&
        (confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-[10px]">
              {usage > 0
                ? `Used ${usage}× — layers keep this color. Can't be undone across pages.`
                : 'Delete?'}
            </span>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                deleteVariable(ydoc, variable.id);
                setConfirmingDelete(false);
              }}
            >
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={startDelete}
            className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
            aria-label={`Delete ${variable.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ))}
    </li>
  );
}
