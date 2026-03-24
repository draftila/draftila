import * as Y from 'yjs';

export interface Variable {
  id: string;
  name: string;
  type: 'color';
  value: string;
}

function getVariablesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
}

export function getVariables(ydoc: Y.Doc): Variable[] {
  const map = getVariablesMap(ydoc);
  const result: Variable[] = [];
  for (const [id, data] of map) {
    result.push({
      id,
      name: (data.get('name') as string) ?? '',
      type: (data.get('type') as 'color') ?? 'color',
      value: (data.get('value') as string) ?? '#000000',
    });
  }
  return result;
}

export function getVariable(ydoc: Y.Doc, id: string): Variable | null {
  const map = getVariablesMap(ydoc);
  const data = map.get(id);
  if (!data) return null;
  return {
    id,
    name: (data.get('name') as string) ?? '',
    type: (data.get('type') as 'color') ?? 'color',
    value: (data.get('value') as string) ?? '#000000',
  };
}

export function setVariable(ydoc: Y.Doc, id: string, name: string, value: string): Variable {
  const map = getVariablesMap(ydoc);
  ydoc.transact(() => {
    const existing = map.get(id);
    if (existing) {
      existing.set('name', name);
      existing.set('value', value);
    } else {
      const entry = new Y.Map<unknown>();
      entry.set('name', name);
      entry.set('type', 'color');
      entry.set('value', value);
      map.set(id, entry);
    }
  });
  return { id, name, type: 'color', value };
}

export function deleteVariable(ydoc: Y.Doc, id: string): boolean {
  const map = getVariablesMap(ydoc);
  if (!map.has(id)) return false;
  ydoc.transact(() => {
    map.delete(id);
  });
  return true;
}

export function resolveVariableColor(ydoc: Y.Doc, variableId: string): string | null {
  const variable = getVariable(ydoc, variableId);
  if (!variable || variable.type !== 'color') return null;
  return variable.value;
}
