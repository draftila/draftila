import type { EditorMode, ToolType } from '@draftila/shared';

const DRAW_MODE_DISABLED_TOOLS = new Set<ToolType>(['frame', 'comment']);

export function isToolAllowedInMode(tool: ToolType, mode: EditorMode): boolean {
  if (mode !== 'draw') return true;
  return !DRAW_MODE_DISABLED_TOOLS.has(tool);
}

export function normalizeToolForMode(tool: ToolType, mode: EditorMode): ToolType {
  return isToolAllowedInMode(tool, mode) ? tool : 'move';
}
