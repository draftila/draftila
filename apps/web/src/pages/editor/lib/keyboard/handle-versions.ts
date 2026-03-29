import { useEditorStore } from '@/stores/editor-store';

export function handleVersionKeyDown(e: KeyboardEvent): boolean {
  const isMod = e.metaKey || e.ctrlKey;
  if (isMod && e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    useEditorStore.getState().setSaveVersionDialogOpen(true);
    return true;
  }
  return false;
}
