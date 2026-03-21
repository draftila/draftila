import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
  label: string;
  keys: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const isMac = navigator.platform.toUpperCase().includes('MAC');
const mod = isMac ? '\u2318' : 'Ctrl';

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tools',
    shortcuts: [
      { label: 'Move', keys: 'V' },
      { label: 'Hand / Pan', keys: 'H' },
      { label: 'Frame', keys: 'F' },
      { label: 'Rectangle', keys: 'R' },
      { label: 'Ellipse', keys: 'O' },
      { label: 'Polygon', keys: 'Y' },
      { label: 'Star', keys: 'S' },
      { label: 'Line', keys: 'L' },
      { label: 'Arrow', keys: 'A' },
      { label: 'Text', keys: 'T' },
      { label: 'Pen (B\u00e9zier)', keys: 'P' },
      { label: 'Pencil (Freehand)', keys: '\u21E7P' },
      { label: 'Node Edit', keys: 'Enter' },
    ],
  },
  {
    title: 'Selection & Editing',
    shortcuts: [
      { label: 'Select All', keys: `${mod}A` },
      { label: 'Delete', keys: 'Del / \u232B' },
      { label: 'Duplicate', keys: `${mod}D` },
      { label: 'Group', keys: `${mod}G` },
      { label: 'Ungroup', keys: `${mod}\u21E7G` },
      { label: 'Frame Selection', keys: `${mod}\u2325G` },
      { label: 'Flip Horizontal', keys: '\u21E7H' },
      { label: 'Flip Vertical', keys: '\u21E7V' },
      { label: 'Lock / Unlock', keys: `${mod}\u21E7L` },
      { label: 'Hide / Show', keys: `${mod}\u21E7H` },
      { label: 'Next Sibling', keys: 'Tab' },
      { label: 'Previous Sibling', keys: '\u21E7Tab' },
      { label: 'Copy', keys: `${mod}C` },
      { label: 'Paste', keys: `${mod}V` },
      { label: 'Paste in Place', keys: `${mod}\u21E7V` },
      { label: 'Alt + Drag', keys: '\u2325 + Drag' },
      { label: 'Cut', keys: `${mod}X` },
      { label: 'Copy Style', keys: `${mod}\u2325C` },
      { label: 'Paste Style', keys: `${mod}\u2325V` },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { label: 'Zoom In', keys: `${mod}+` },
      { label: 'Zoom Out', keys: `${mod}-` },

      { label: 'Zoom to Fit All', keys: '\u21E71' },
      { label: 'Zoom to Selection', keys: '\u21E72' },
      { label: 'Pan', keys: 'Space + Drag' },
    ],
  },
  {
    title: 'History',
    shortcuts: [
      { label: 'Undo', keys: `${mod}Z` },
      { label: 'Redo', keys: `${mod}\u21E7Z` },
    ],
  },
  {
    title: 'Arrange',
    shortcuts: [
      { label: 'Bring Forward', keys: `${mod}]` },
      { label: 'Send Backward', keys: `${mod}[` },
      { label: 'Bring to Front', keys: `${mod}\u2325]` },
      { label: 'Send to Back', keys: `${mod}\u2325[` },
      { label: 'Nudge', keys: '\u2190\u2191\u2192\u2193' },
      { label: 'Big Nudge', keys: '\u21E7 + Arrow' },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_GROUPS;

    return SHORTCUT_GROUPS.map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter(
        (s) => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q),
      ),
    })).filter((group) => group.shortcuts.length > 0);
  }, [query]);

  const totalResults = filteredGroups.reduce((sum, g) => sum + g.shortcuts.length, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="border-input flex items-center gap-2 rounded-md border px-2.5 py-1.5">
          <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
            autoFocus
          />
          {query && (
            <span className="text-muted-foreground shrink-0 text-[10px]">
              {totalResults} result{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="space-y-5 overflow-auto pt-1">
          {filteredGroups.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-xs">No shortcuts found</p>
          )}
          {filteredGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between rounded px-2 py-1"
                  >
                    <span className="text-xs">{shortcut.label}</span>
                    <kbd className="bg-muted rounded px-2 py-0.5 font-mono text-[11px]">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
