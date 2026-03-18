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
      { label: 'Zoom to 100%', keys: `${mod}0` },
      { label: 'Zoom to 100% (Preset)', keys: `${mod}1` },
      { label: 'Zoom to 200%', keys: `${mod}2` },
      { label: 'Zoom to 50%', keys: `${mod}5` },
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {SHORTCUT_GROUPS.map((group) => (
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
