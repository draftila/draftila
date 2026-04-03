import type { BrushSettings, Point, Camera, CanvasGuide, ToolType } from '@draftila/shared';
import type * as Y from 'yjs';
import type { GuideSnapTarget } from '../snap';

export interface ToolStore {
  readonly selectedIds: string[];
  readonly enteredGroupId: string | null;
  readonly camera: Camera;
  setSelectedIds(ids: string[]): void;
  setActiveTool(tool: ToolType): void;
  setIsDrawing(drawing: boolean): void;
  setIsPanning(panning: boolean): void;
  toggleSelection(id: string): void;
  clearSelection(): void;
  setHoveredId(id: string | null): void;
  setCamera(camera: Camera): void;
  setEnteredGroupId(id: string | null): void;
  getGuides(): GuideSnapTarget[];
  getCanvasGuides(): CanvasGuide[];
  setSelectedGuideId(id: string | null): void;
  getActivePageId(): string | null;
  getBrushSettings(): BrushSettings;
  setBrushSettings(settings: Partial<BrushSettings>): void;
}

let toolStore: ToolStore | null = null;

export function configureToolStore(store: ToolStore) {
  toolStore = store;
}

export function getToolStore(): ToolStore {
  if (!toolStore) {
    throw new Error(
      '@draftila/engine: ToolStore not configured. Call configureToolStore() before using tools.',
    );
  }
  return toolStore;
}

export interface ToolContext {
  ydoc: Y.Doc;
  camera: Camera;
  canvasPoint: Point;
  screenPoint: Point;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  button: number;
}

export interface ToolResult {
  cursor?: string;
  preventToolSwitch?: boolean;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly cursor: string;

  onPointerDown(_ctx: ToolContext): ToolResult | void {}
  onPointerMove(_ctx: ToolContext): ToolResult | void {}
  onPointerUp(_ctx: ToolContext): ToolResult | void {}
  onKeyDown(
    _key: string,
    _ctx: Omit<ToolContext, 'canvasPoint' | 'screenPoint' | 'button'>,
  ): ToolResult | void {}
  onKeyUp(
    _key: string,
    _ctx: Omit<ToolContext, 'canvasPoint' | 'screenPoint' | 'button'>,
  ): ToolResult | void {}
  onActivate(): void {}
  onDeactivate(): void {}
}
