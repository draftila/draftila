import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getShape, addShape } from './scene-graph';

export interface ComponentDefinition {
  id: string;
  name: string;
  shapes: Shape[];
}

export interface ComponentInstanceInfo {
  shapeId: string;
  componentId: string;
}

type ComponentInstanceMap = Y.Map<string>;

export function getComponentsMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('components') as Y.Map<Y.Map<unknown>>;
}

export function getComponentInstancesMap(ydoc: Y.Doc): ComponentInstanceMap {
  return ydoc.getMap('componentInstances') as ComponentInstanceMap;
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

export function createInstance(
  ydoc: Y.Doc,
  componentId: string,
  x: number,
  y: number,
  parentId?: string | null,
): string[] {
  const components = getComponentsMap(ydoc);
  const componentData = components.get(componentId);
  if (!componentData) return [];

  const shapesJson = componentData.get('shapes') as string;
  const shapes: Shape[] = JSON.parse(shapesJson);
  if (shapes.length === 0) return [];

  const sourceById = new Map<string, Shape>();
  for (const shape of shapes) {
    sourceById.set(shape.id, shape);
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const shape of shapes) {
    if (shape.x < minX) minX = shape.x;
    if (shape.y < minY) minY = shape.y;
  }

  const oldToNewIds = new Map<string, string>();
  const rootIds: string[] = [];
  const instances = getComponentInstancesMap(ydoc);

  ydoc.transact(() => {
    for (const shape of shapes) {
      const originalParentId = shape.parentId;
      const remappedParentId = originalParentId
        ? (oldToNewIds.get(originalParentId) ?? null)
        : null;
      const isRoot = !originalParentId || !sourceById.has(originalParentId);

      const { id: _id, ...rest } = shape;
      const newId = addShape(ydoc, shape.type, {
        ...rest,
        x: shape.x - minX + x,
        y: shape.y - minY + y,
        parentId: isRoot ? (parentId ?? null) : remappedParentId,
      });

      oldToNewIds.set(shape.id, newId);
      instances.set(newId, componentId);

      if (isRoot) {
        rootIds.push(newId);
      }
    }
  });

  return rootIds;
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

export function removeComponent(ydoc: Y.Doc, componentId: string): boolean {
  const components = getComponentsMap(ydoc);
  const instances = getComponentInstancesMap(ydoc);

  if (!components.has(componentId)) return false;

  ydoc.transact(() => {
    components.delete(componentId);
    const instanceEntries = Array.from(instances.entries());
    for (const [shapeId, mappedComponentId] of instanceEntries) {
      if (mappedComponentId === componentId) {
        instances.delete(shapeId);
      }
    }
  });

  return true;
}

export function renameComponent(ydoc: Y.Doc, componentId: string, name: string): boolean {
  const components = getComponentsMap(ydoc);
  const component = components.get(componentId);
  if (!component) return false;
  component.set('name', name);
  return true;
}

export function getComponentById(ydoc: Y.Doc, componentId: string): ComponentDefinition | null {
  const components = getComponentsMap(ydoc);
  const component = components.get(componentId);
  if (!component) return null;
  const shapesJson = component.get('shapes') as string;

  return {
    id: componentId,
    name: (component.get('name') as string) ?? 'Component',
    shapes: JSON.parse(shapesJson),
  };
}

export function getInstanceComponentId(ydoc: Y.Doc, shapeId: string): string | null {
  const instances = getComponentInstancesMap(ydoc);
  return instances.get(shapeId) ?? null;
}

export function isComponentInstance(ydoc: Y.Doc, shapeId: string): boolean {
  return getComponentInstancesMap(ydoc).has(shapeId);
}

export function listComponentInstances(ydoc: Y.Doc): ComponentInstanceInfo[] {
  const instances = getComponentInstancesMap(ydoc);
  const result: ComponentInstanceInfo[] = [];
  instances.forEach((componentId, shapeId) => {
    result.push({ shapeId, componentId });
  });
  return result;
}

export function observeComponents(ydoc: Y.Doc, callback: () => void): () => void {
  const components = getComponentsMap(ydoc);
  const instances = getComponentInstancesMap(ydoc);

  const handle = () => callback();
  components.observeDeep(handle);
  instances.observe(handle);

  return () => {
    components.unobserveDeep(handle);
    instances.unobserve(handle);
  };
}
