import type { Shape, Subpath, VectorNode } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { getShape, updateShape, getAllShapes } from '../scene-graph';
import {
  svgPathToVectorNodes,
  vectorNodesToSvgPath,
  updateVectorNode,
  deleteNodeFromSubpath,
  addNodeToSubpath,
} from '../vector-nodes';

export interface SelectedNode {
  subpathIndex: number;
  nodeIndex: number;
}

export interface DragTarget {
  type: 'anchor' | 'handleIn' | 'handleOut';
  subpathIndex: number;
  nodeIndex: number;
}

export interface MidpointHandle {
  subpathIndex: number;
  afterNodeIndex: number;
  x: number;
  y: number;
}

type NodeToolState =
  | { type: 'idle' }
  | {
      type: 'dragging';
      target: DragTarget;
      startCanvas: { x: number; y: number };
      initialNode: VectorNode;
    }
  | { type: 'marquee'; startCanvas: { x: number; y: number } };

const NODE_HIT_RADIUS = 8;
const HANDLE_HIT_RADIUS = 6;
const MIDPOINT_HIT_RADIUS = 6;

export class NodeTool extends BaseTool {
  readonly name = 'node';
  readonly cursor = 'default';

  private state: NodeToolState = { type: 'idle' };
  private editingShapeId: string | null = null;
  private cachedSubpaths: Subpath[] = [];

  selectedNodes: SelectedNode[] = [];

  onActivate(): void {
    this.state = { type: 'idle' };
  }

  onDeactivate(): void {
    this.exitPathEditing();
  }

  private enterPathEditing(ydoc: import('yjs').Doc, shapeId: string): boolean {
    const shape = getShape(ydoc, shapeId);
    if (!shape) return false;

    const svgPath = this.getShapeSvgPath(shape);
    if (!svgPath) return false;

    this.editingShapeId = shapeId;
    this.cachedSubpaths = svgPathToVectorNodes(svgPath);
    this.selectedNodes = [];
    return true;
  }

  enterPathEditingForShape(ydoc: import('yjs').Doc, shapeId: string): boolean {
    return this.enterPathEditing(ydoc, shapeId);
  }

  canEditShape(ydoc: import('yjs').Doc, shapeId: string): boolean {
    const shape = getShape(ydoc, shapeId);
    if (!shape) return false;
    return Boolean(this.getShapeSvgPath(shape));
  }

  private exitPathEditing() {
    this.editingShapeId = null;
    this.cachedSubpaths = [];
    this.selectedNodes = [];
    this.state = { type: 'idle' };
  }

  private getShapeSvgPath(shape: Shape): string | null {
    if (
      'svgPathData' in shape &&
      typeof shape.svgPathData === 'string' &&
      shape.svgPathData.length > 0
    ) {
      return shape.svgPathData;
    }
    return null;
  }

  getEditingShapeId(): string | null {
    return this.editingShapeId;
  }

  getSubpaths(): Subpath[] {
    return this.cachedSubpaths;
  }

  getPreviewPathData(): string | null {
    return vectorNodesToSvgPath(this.cachedSubpaths);
  }

  getMidpointHandles(): MidpointHandle[] {
    const handles: MidpointHandle[] = [];
    for (let subpathIndex = 0; subpathIndex < this.cachedSubpaths.length; subpathIndex++) {
      const subpath = this.cachedSubpaths[subpathIndex];
      if (!subpath || subpath.nodes.length < 2) continue;

      for (let nodeIndex = 0; nodeIndex < subpath.nodes.length - 1; nodeIndex++) {
        const a = subpath.nodes[nodeIndex];
        const b = subpath.nodes[nodeIndex + 1];
        if (!a || !b) continue;
        handles.push({
          subpathIndex,
          afterNodeIndex: nodeIndex,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        });
      }

      if (subpath.closed) {
        const lastIndex = subpath.nodes.length - 1;
        const a = subpath.nodes[lastIndex];
        const b = subpath.nodes[0];
        if (a && b) {
          handles.push({
            subpathIndex,
            afterNodeIndex: lastIndex,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          });
        }
      }
    }
    return handles;
  }

  getEditingShape(ctx: ToolContext): Shape | null {
    if (!this.editingShapeId) return null;
    const shapes = getAllShapes(ctx.ydoc);
    return shapes.find((s) => s.id === this.editingShapeId) ?? null;
  }

  onPointerDown(ctx: ToolContext): ToolResult | void {
    if (!this.editingShapeId) {
      const store = getToolStore();
      if (store.selectedIds.length === 1) {
        const entered = this.enterPathEditing(ctx.ydoc, store.selectedIds[0]!);
        if (!entered) {
          store.setActiveTool('move');
          return;
        }
      } else {
        store.setActiveTool('move');
        return;
      }
    }

    const shape = this.getEditingShape(ctx);
    if (!shape) return;

    const localX = ctx.canvasPoint.x - shape.x;
    const localY = ctx.canvasPoint.y - shape.y;
    const zoom = ctx.camera.zoom;

    const hit = this.hitTestNodes(localX, localY, zoom);

    if (hit) {
      const node = this.cachedSubpaths[hit.subpathIndex]?.nodes[hit.nodeIndex];
      if (!node) return;

      if (hit.type === 'anchor' && !ctx.shiftKey) {
        this.selectedNodes = [{ subpathIndex: hit.subpathIndex, nodeIndex: hit.nodeIndex }];
      } else if (hit.type === 'anchor' && ctx.shiftKey) {
        const existing = this.selectedNodes.findIndex(
          (n) => n.subpathIndex === hit.subpathIndex && n.nodeIndex === hit.nodeIndex,
        );
        if (existing >= 0) {
          this.selectedNodes = this.selectedNodes.filter((_, i) => i !== existing);
        } else {
          this.selectedNodes = [
            ...this.selectedNodes,
            { subpathIndex: hit.subpathIndex, nodeIndex: hit.nodeIndex },
          ];
        }
      }

      this.state = {
        type: 'dragging',
        target: hit,
        startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
        initialNode: { ...node },
      };

      return { cursor: 'grabbing' };
    }

    const midpointHit = this.hitTestMidpoints(localX, localY, zoom);
    if (midpointHit) {
      this.cachedSubpaths = addNodeToSubpath(
        this.cachedSubpaths,
        midpointHit.subpathIndex,
        midpointHit.afterNodeIndex,
        { x: midpointHit.x, y: midpointHit.y },
      );

      const newNodeIndex = midpointHit.afterNodeIndex + 1;
      const inserted = this.cachedSubpaths[midpointHit.subpathIndex]?.nodes[newNodeIndex];
      if (!inserted) return;

      this.selectedNodes = [{ subpathIndex: midpointHit.subpathIndex, nodeIndex: newNodeIndex }];
      this.state = {
        type: 'dragging',
        target: {
          type: 'anchor',
          subpathIndex: midpointHit.subpathIndex,
          nodeIndex: newNodeIndex,
        },
        startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
        initialNode: { ...inserted },
      };
      return { cursor: 'grabbing' };
    }

    this.selectedNodes = [];
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (this.state.type !== 'dragging') return;

    const shape = this.getEditingShape(ctx);
    if (!shape) return;

    const { target, startCanvas, initialNode } = this.state;
    let dx = ctx.canvasPoint.x - startCanvas.x;
    let dy = ctx.canvasPoint.y - startCanvas.y;

    if (ctx.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    let updates: Partial<VectorNode>;

    switch (target.type) {
      case 'anchor':
        updates = {
          x: initialNode.x + dx,
          y: initialNode.y + dy,
        };
        break;
      case 'handleIn':
        updates = {
          handleInX: initialNode.handleInX + dx,
          handleInY: initialNode.handleInY + dy,
        };
        break;
      case 'handleOut':
        updates = {
          handleOutX: initialNode.handleOutX + dx,
          handleOutY: initialNode.handleOutY + dy,
        };
        break;
    }

    this.cachedSubpaths = updateVectorNode(
      this.cachedSubpaths,
      target.subpathIndex,
      target.nodeIndex,
      updates,
    );

    return { cursor: 'grabbing' };
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (this.state.type !== 'dragging') return;

    const shape = this.getEditingShape(ctx);
    if (!shape) {
      this.state = { type: 'idle' };
      return;
    }

    const newPathData = vectorNodesToSvgPath(this.cachedSubpaths);
    if (newPathData) {
      updateShape(ctx.ydoc, shape.id, {
        svgPathData: newPathData,
        vectorNodes: this.cachedSubpaths,
      } as Partial<Shape>);
    }

    this.state = { type: 'idle' };
    return { cursor: 'default' };
  }

  onKeyDown(
    key: string,
    ctx: Omit<ToolContext, 'canvasPoint' | 'screenPoint' | 'button'>,
  ): ToolResult | void {
    if (key === 'Escape') {
      const store = getToolStore();
      store.setActiveTool('move');
      return;
    }

    if ((key === 'Delete' || key === 'Backspace') && this.selectedNodes.length > 0) {
      this.deleteSelectedNodes(ctx.ydoc);
      return;
    }
  }

  private deleteSelectedNodes(ydoc: import('yjs').Doc) {
    if (!this.editingShapeId || this.selectedNodes.length === 0) return;

    let subpaths = this.cachedSubpaths;
    const sorted = [...this.selectedNodes].sort(
      (a, b) => b.nodeIndex - a.nodeIndex || b.subpathIndex - a.subpathIndex,
    );

    for (const sel of sorted) {
      subpaths = deleteNodeFromSubpath(subpaths, sel.subpathIndex, sel.nodeIndex);
    }

    if (subpaths.length === 0) return;

    this.cachedSubpaths = subpaths;
    this.selectedNodes = [];

    const newPathData = vectorNodesToSvgPath(subpaths);
    if (newPathData) {
      updateShape(ydoc, this.editingShapeId, {
        svgPathData: newPathData,
        vectorNodes: subpaths,
      } as Partial<Shape>);
    }
  }

  private hitTestNodes(localX: number, localY: number, zoom: number): DragTarget | null {
    const nodeRadius = NODE_HIT_RADIUS / zoom;
    const handleRadius = HANDLE_HIT_RADIUS / zoom;

    for (const sel of this.selectedNodes) {
      const node = this.cachedSubpaths[sel.subpathIndex]?.nodes[sel.nodeIndex];
      if (!node) continue;

      const hiDx = localX - (node.x + node.handleInX);
      const hiDy = localY - (node.y + node.handleInY);
      if (
        Math.sqrt(hiDx * hiDx + hiDy * hiDy) <= handleRadius &&
        (node.handleInX !== 0 || node.handleInY !== 0)
      ) {
        return { type: 'handleIn', subpathIndex: sel.subpathIndex, nodeIndex: sel.nodeIndex };
      }

      const hoDx = localX - (node.x + node.handleOutX);
      const hoDy = localY - (node.y + node.handleOutY);
      if (
        Math.sqrt(hoDx * hoDx + hoDy * hoDy) <= handleRadius &&
        (node.handleOutX !== 0 || node.handleOutY !== 0)
      ) {
        return { type: 'handleOut', subpathIndex: sel.subpathIndex, nodeIndex: sel.nodeIndex };
      }
    }

    for (let si = 0; si < this.cachedSubpaths.length; si++) {
      const sp = this.cachedSubpaths[si]!;
      for (let ni = 0; ni < sp.nodes.length; ni++) {
        const node = sp.nodes[ni]!;
        const dx = localX - node.x;
        const dy = localY - node.y;
        if (Math.sqrt(dx * dx + dy * dy) <= nodeRadius) {
          return { type: 'anchor', subpathIndex: si, nodeIndex: ni };
        }
      }
    }

    return null;
  }

  private hitTestMidpoints(localX: number, localY: number, zoom: number): MidpointHandle | null {
    const radius = MIDPOINT_HIT_RADIUS / zoom;
    const handles = this.getMidpointHandles();

    for (const handle of handles) {
      const dx = localX - handle.x;
      const dy = localY - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        return handle;
      }
    }

    return null;
  }
}
