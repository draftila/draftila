import type { ToolContext } from '@draftila/engine/tools/base-tool';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { resolveGroupTarget } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';

export function handleReadOnlySelection(ctx: ToolContext, select: boolean) {
  const state = useEditorStore.getState();
  const hit = hitTestPoint(
    ctx.canvasPoint.x,
    ctx.canvasPoint.y,
    ctx.shapes,
    ctx.spatialIndex,
    ctx.camera.zoom,
  );
  const id = hit ? resolveGroupTarget(ctx.ydoc, hit.id, state.enteredGroupId, ctx.shapeMap) : null;
  state.setHoveredId(id);
  if (!select || ctx.button !== 0) return;
  if (id && ctx.shiftKey) state.toggleSelection(id);
  else state.setSelectedIds(id ? [id] : []);
}
