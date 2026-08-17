import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getLayerTree,
  getShape,
  isUpdateOnlyChange,
  observeShapes,
  type LayerTreeNode,
} from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import { measure, setValue } from '@/lib/perf-metrics';
import type { LayerRow } from '../types';

function flattenRows(
  tree: LayerTreeNode[],
  collapsedIds: Set<string>,
  cache: Map<string, LayerRow>,
): LayerRow[] {
  const rows: LayerRow[] = [];
  const seen = new Set<string>();

  const walk = (
    nodes: LayerTreeNode[],
    depth: number,
    parentVisible: boolean,
    parentLocked: boolean,
  ) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node) continue;
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && !collapsedIds.has(node.shape.id);
      const effectiveVisible = parentVisible && node.shape.visible;
      const effectiveLocked = parentLocked || node.shape.locked;

      const cached = cache.get(node.shape.id);
      if (
        cached &&
        cached.shape === node.shape &&
        cached.depth === depth &&
        cached.hasChildren === hasChildren &&
        cached.expanded === expanded &&
        cached.effectiveVisible === effectiveVisible &&
        cached.effectiveLocked === effectiveLocked
      ) {
        rows.push(cached);
      } else {
        const row: LayerRow = {
          shape: node.shape,
          depth,
          hasChildren,
          expanded,
          effectiveVisible,
          effectiveLocked,
        };
        cache.set(node.shape.id, row);
        rows.push(row);
      }
      seen.add(node.shape.id);

      if (hasChildren && expanded) {
        walk(node.children, depth + 1, effectiveVisible, effectiveLocked);
      }
    }
  };

  walk(tree, 0, true, false);

  for (const id of cache.keys()) {
    if (!seen.has(id)) cache.delete(id);
  }

  return rows;
}

function patchTree(nodes: LayerTreeNode[], changed: ReadonlySet<string>, ydoc: Y.Doc) {
  let treeChanged = false;
  const seen = new Set<string>();

  const visit = (list: LayerTreeNode[]): LayerTreeNode[] => {
    let listChanged = false;
    const next = list.map((node) => {
      const children = node.children.length > 0 ? visit(node.children) : node.children;
      if (changed.has(node.shape.id)) seen.add(node.shape.id);
      const shape = changed.has(node.shape.id) ? getShape(ydoc, node.shape.id) : null;

      if (!shape && children === node.children) return node;

      listChanged = true;
      return { shape: shape ?? node.shape, children };
    });

    if (!listChanged) return list;
    treeChanged = true;
    return next;
  };

  const result = visit(nodes);
  if (seen.size !== changed.size) return null;
  return treeChanged ? result : nodes;
}

export function useLayerTree(ydoc: Y.Doc) {
  const activePageId = useEditorStore((s) => s.activePageId);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const rowCacheRef = useRef<Map<string, LayerRow>>(new Map());
  const layerTreeRef = useRef<LayerTreeNode[]>([]);

  const applyTree = useCallback((tree: LayerTreeNode[]) => {
    layerTreeRef.current = tree;
    setLayerTree(tree);
  }, []);

  useEffect(() => {
    setCollapsedIds(new Set());
    applyTree(measure('yjs.getLayerTree', () => getLayerTree(ydoc)));

    const unobserve = observeShapes(ydoc, (changes) => {
      if (isUpdateOnlyChange(changes)) {
        const patched = patchTree(layerTreeRef.current, new Set(changes.updated), ydoc);
        if (patched) {
          applyTree(patched);
          return;
        }
      }
      applyTree(measure('yjs.getLayerTree', () => getLayerTree(ydoc)));
    });
    return unobserve;
  }, [ydoc, activePageId, applyTree]);

  const shapeById = useMemo(() => {
    const map = new Map<string, Shape>();
    const walk = (nodes: LayerTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.shape.id, node.shape);
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(layerTree);
    return map;
  }, [layerTree]);

  const rows = useMemo(() => {
    const flattened = measure('layers.flattenRows', () =>
      flattenRows(layerTree, collapsedIds, rowCacheRef.current),
    );
    setValue('layers.rows', flattened.length);
    return flattened;
  }, [layerTree, collapsedIds]);

  const toggleExpanded = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandNode = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { rows, shapeById, toggleExpanded, expandNode };
}
