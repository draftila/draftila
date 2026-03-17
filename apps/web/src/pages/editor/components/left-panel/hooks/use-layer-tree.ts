import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getLayerTree, observeShapes, type LayerTreeNode } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import type { LayerRow } from '../types';

function flattenRows(tree: LayerTreeNode[], collapsedIds: Set<string>): LayerRow[] {
  const rows: LayerRow[] = [];

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

      rows.push({
        shape: node.shape,
        depth,
        hasChildren,
        expanded,
        effectiveVisible,
        effectiveLocked,
      });

      if (hasChildren && expanded) {
        walk(node.children, depth + 1, effectiveVisible, effectiveLocked);
      }
    }
  };

  walk(tree, 0, true, false);
  return rows;
}

export function useLayerTree(ydoc: Y.Doc) {
  const activePageId = useEditorStore((s) => s.activePageId);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedIds(new Set());
    setLayerTree(getLayerTree(ydoc));
    const unobserve = observeShapes(ydoc, () => {
      setLayerTree(getLayerTree(ydoc));
    });
    return unobserve;
  }, [ydoc, activePageId]);

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

  const rows = useMemo(() => flattenRows(layerTree, collapsedIds), [layerTree, collapsedIds]);

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
