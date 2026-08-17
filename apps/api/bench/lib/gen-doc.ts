import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { addShape, initDocument, getShapesMap, getZOrder } from '@draftila/engine/scene-graph';
import { ensureDefaultPage } from '@draftila/engine/pages';

export interface GenOptions {
  shapeCount: number;
  childrenPerFrame: number;
  textRatio: number;
  spread: number;
}

export const DEFAULT_GEN: Omit<GenOptions, 'shapeCount'> = {
  childrenPerFrame: 20,
  textRatio: 0.25,
  spread: 6000,
};

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function generateDoc(options: GenOptions): {
  ydoc: Y.Doc;
  frameIds: string[];
  shapeIds: string[];
} {
  const { shapeCount, childrenPerFrame, textRatio, spread } = options;
  const random = pseudoRandom(shapeCount * 7919 + 13);
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);

  const frameCount = Math.max(1, Math.ceil(shapeCount / (childrenPerFrame + 1)));
  const frameIds: string[] = [];
  const childIdsByFrame = new Map<string, string[]>();

  let created = 0;

  ydoc.transact(() => {
    for (let f = 0; f < frameCount && created < shapeCount; f++) {
      const frameX = Math.round(random() * spread);
      const frameY = Math.round(random() * spread);
      const frameId = addShape(ydoc, 'frame', {
        name: `Frame ${f}`,
        x: frameX,
        y: frameY,
        width: 480,
        height: 640,
      } as Partial<Shape>);
      frameIds.push(frameId);
      created++;

      const children: string[] = [];
      for (let c = 0; c < childrenPerFrame && created < shapeCount; c++) {
        const isText = random() < textRatio;
        const childX = frameX + Math.round(random() * 400);
        const childY = frameY + Math.round(random() * 560);
        const id = isText
          ? addShape(ydoc, 'text', {
              name: `Label ${f}-${c}`,
              x: childX,
              y: childY,
              width: 160,
              height: 24,
              content: `Item ${f}-${c} sample copy`,
            } as unknown as Partial<Shape>)
          : addShape(ydoc, random() < 0.5 ? 'rectangle' : 'ellipse', {
              name: `Shape ${f}-${c}`,
              x: childX,
              y: childY,
              width: 80 + Math.round(random() * 120),
              height: 40 + Math.round(random() * 80),
            } as Partial<Shape>);
        children.push(id);
        created++;
      }
      childIdsByFrame.set(frameId, children);
    }
  });

  const shapesMap = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  ydoc.transact(() => {
    const ordered: string[] = [];
    for (const frameId of frameIds) {
      ordered.push(frameId);
      for (const childId of childIdsByFrame.get(frameId) ?? []) {
        shapesMap.get(childId)?.set('parentId', frameId);
        ordered.push(childId);
      }
    }
    zOrder.delete(0, zOrder.length);
    zOrder.insert(0, ordered);
  });

  return { ydoc, frameIds, shapeIds: Array.from(shapesMap.keys()) };
}

export function docStateBytes(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(ydoc);
}
