import type { ToolType } from '@draftila/shared';

export function isReadOnlyEditor(state: {
  canEditDocument: boolean;
  previewSnapshotId: string | null;
}) {
  return !state.canEditDocument || state.previewSnapshotId !== null;
}

export function isReadOnlyTool(tool: ToolType) {
  return tool === 'move' || tool === 'hand' || tool === 'comment';
}
