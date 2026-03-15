import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getShape, addShape, getAllShapes, getShapesMap, getZOrder } from './scene-graph';

export interface ComponentDefinition {
  id: string;
  name: string;
  shapes: Shape[];
}

export function getComponentsMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('components') as Y.Map<Y.Map<unknown>>;
}

export function createComponent(ydoc: Y.Doc, shapeIds: string[], name: string): string {
  const components = getComponentsMap(ydoc);
  const shapes: Shape[] = [];

  for (const id of shapeIds) {
    const shape = getShape(ydoc, id);
    if (shape) shapes.push(shape);
  }

  if (shapes.length === 0) return '';

  const componentId = `comp_${crypto.randomUUID().slice(0, 8)}`;
  const componentData = new Y.Map<unknown>();

  ydoc.transact(() => {
    componentData.set('id', componentId);
    componentData.set('name', name);
    componentData.set('shapes', JSON.stringify(shapes));
    components.set(componentId, componentData);
  });

  return componentId;
}

export function createInstance(ydoc: Y.Doc, componentId: string, x: number, y: number): string[] {
  const components = getComponentsMap(ydoc);
  const componentData = components.get(componentId);
  if (!componentData) return [];

  const shapesJson = componentData.get('shapes') as string;
  const shapes: Shape[] = JSON.parse(shapesJson);

  let minX = Infinity;
  let minY = Infinity;
  for (const shape of shapes) {
    if (shape.x < minX) minX = shape.x;
    if (shape.y < minY) minY = shape.y;
  }

  const newIds: string[] = [];
  for (const shape of shapes) {
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      x: shape.x - minX + x,
      y: shape.y - minY + y,
    });
    newIds.push(newId);
  }

  return newIds;
}

export function listComponents(ydoc: Y.Doc): ComponentDefinition[] {
  const components = getComponentsMap(ydoc);
  const result: ComponentDefinition[] = [];

  components.forEach((data, id) => {
    const shapesJson = data.get('shapes') as string;
    result.push({
      id,
      name: (data.get('name') as string) ?? 'Component',
      shapes: JSON.parse(shapesJson),
    });
  });

  return result;
}
