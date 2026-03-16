import type * as Y from 'yjs';
import type { Point, Shape } from '@draftila/shared';
import { addShape } from './scene-graph';
import {
  initializeDefaultAdapters,
  detectImportAdapter,
  shapesToInterchange,
  interchangeToShapeData,
  generateSvg,
} from './interchange';
import type { ImportData, InterchangeDocument } from './interchange';

export interface ExternalPasteOptions {
  targetParentId?: string | null;
  cursorPosition?: Point | null;
}

function computeShapesOffset(
  shapes: { x: number; y: number; width: number; height: number }[],
  cursorPosition: Point | null | undefined,
): { offsetX: number; offsetY: number } {
  if (!cursorPosition || shapes.length === 0) return { offsetX: 0, offsetY: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  return {
    offsetX: cursorPosition.x - (minX + maxX) / 2,
    offsetY: cursorPosition.y - (minY + maxY) / 2,
  };
}

function addInterchangeDocToYdoc(
  ydoc: Y.Doc,
  doc: InterchangeDocument,
  options?: ExternalPasteOptions,
): string[] {
  const shapeData = interchangeToShapeData(doc);
  if (shapeData.length === 0) return [];

  const targetParentId = options?.targetParentId ?? null;
  const boundsItems = shapeData.map((s) => ({
    x: (s.props['x'] as number) ?? 0,
    y: (s.props['y'] as number) ?? 0,
    width: (s.props['width'] as number) ?? 100,
    height: (s.props['height'] as number) ?? 100,
  }));
  const { offsetX, offsetY } = computeShapesOffset(boundsItems, options?.cursorPosition);

  const indexToId = new Map<number, string>();
  const ids: string[] = [];

  for (let i = 0; i < shapeData.length; i++) {
    const item = shapeData[i]!;
    const parentId =
      item.parentIndex !== null
        ? (indexToId.get(item.parentIndex) ?? targetParentId)
        : targetParentId;

    const id = addShape(ydoc, item.type, {
      ...item.props,
      x: ((item.props['x'] as number) ?? 0) + offsetX,
      y: ((item.props['y'] as number) ?? 0) + offsetY,
      parentId,
    });
    indexToId.set(i, id);

    if (item.parentIndex === null) {
      ids.push(id);
    }
  }

  return ids;
}

export function importSvgShapes(
  ydoc: Y.Doc,
  svg: string,
  options?: ExternalPasteOptions,
): string[] {
  initializeDefaultAdapters();
  const adapter = detectImportAdapter({ html: svg }) ?? detectImportAdapter({ text: svg });
  if (!adapter) return [];

  const doc = adapter.import(svg.trim().startsWith('<svg') ? { text: svg } : { html: svg });
  return addInterchangeDocToYdoc(ydoc, doc, options);
}

export type PasteSource = 'svg' | 'draftila' | 'text' | 'unknown';

export function detectPasteSource(html: string | null, text: string | null): PasteSource {
  initializeDefaultAdapters();
  const data: ImportData = { html, text };
  const adapter = detectImportAdapter(data);

  if (adapter) {
    if (adapter.platform === 'draftila') return 'draftila';
    if (adapter.platform === 'svg') return 'svg';
  }

  if (text) return 'text';
  return 'unknown';
}

function tryPasteDraftilaShapes(
  ydoc: Y.Doc,
  html: string | null,
  text: string | null,
  options?: ExternalPasteOptions,
): string[] | null {
  let shapesJson: string | null = null;

  if (html) {
    const match = html.match(/<!-- draftila:([A-Za-z0-9+/=]+) -->/);
    if (match?.[1]) {
      try {
        shapesJson = atob(match[1]);
      } catch {
        // invalid base64
      }
    }
  }

  if (!shapesJson && text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === 'draftila/shapes') {
        shapesJson = text;
      }
    } catch {
      // not JSON
    }
  }

  if (!shapesJson) return null;

  try {
    const parsed = JSON.parse(shapesJson);
    const shapes = parsed.shapes as Shape[];
    if (!Array.isArray(shapes) || shapes.length === 0) return null;

    const targetParentId = options?.targetParentId ?? null;
    const { offsetX, offsetY } = computeShapesOffset(shapes, options?.cursorPosition);
    const oldToNewIds = new Map<string, string>();
    const topLevelIds: string[] = [];
    const shapeById = new Map(shapes.map((s) => [s.id, s]));

    for (const shape of shapes) {
      const isTopLevel = !shape.parentId || !shapeById.has(shape.parentId);
      const parentId = isTopLevel
        ? targetParentId
        : (oldToNewIds.get(shape.parentId!) ?? targetParentId);
      const { id: _id, ...rest } = shape;
      const newId = addShape(ydoc, shape.type, {
        ...rest,
        parentId,
        x: shape.x + offsetX,
        y: shape.y + offsetY,
        name: shape.name,
      });
      oldToNewIds.set(shape.id, newId);
      if (isTopLevel) topLevelIds.push(newId);
    }

    return topLevelIds;
  } catch {
    return null;
  }
}

export function handlePaste(
  ydoc: Y.Doc,
  html: string | null,
  text: string | null,
  options?: ExternalPasteOptions,
): string[] {
  const draftilaIds = tryPasteDraftilaShapes(ydoc, html, text, options);
  if (draftilaIds && draftilaIds.length > 0) return draftilaIds;

  initializeDefaultAdapters();
  const data: ImportData = { html, text };
  const adapter = detectImportAdapter(data);

  if (adapter && adapter.platform !== 'draftila') {
    const doc = adapter.import(data);
    const ids = addInterchangeDocToYdoc(ydoc, doc, options);
    if (ids.length > 0) return ids;
  }

  if (text) {
    const textX = options?.cursorPosition?.x ?? 100;
    const textY = options?.cursorPosition?.y ?? 100;
    const id = addShape(ydoc, 'text', {
      x: textX,
      y: textY,
      width: 200,
      height: 24,
      content: text,
      parentId: options?.targetParentId ?? null,
    });
    return [id];
  }

  return [];
}

export function shapesToSvg(shapes: Shape[]): string {
  const doc = shapesToInterchange(shapes);
  return generateSvg(doc);
}
