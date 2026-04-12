import type { VectorNode, Subpath } from '@draftila/shared';
import paper from 'paper/dist/paper-core';

let paperInitialized = false;

function ensurePaper() {
  if (paperInitialized) return;
  paper.setup(new paper.Size(1, 1));
  paper.settings.insertItems = false;
  paperInitialized = true;
}

export function svgPathToVectorNodes(svgPathData: string): Subpath[] {
  ensurePaper();

  const item = paper.PathItem.create(svgPathData);
  const subpaths: Subpath[] = [];

  if (item instanceof paper.CompoundPath) {
    for (const child of item.children as paper.Path[]) {
      subpaths.push(paperPathToSubpath(child));
    }
    item.remove();
  } else if (item instanceof paper.Path) {
    subpaths.push(paperPathToSubpath(item));
    item.remove();
  }

  return subpaths;
}

function paperPathToSubpath(path: paper.Path): Subpath {
  const nodes: VectorNode[] = [];

  for (const segment of path.segments) {
    const anchor = segment.point;
    const handleIn = segment.handleIn;
    const handleOut = segment.handleOut;

    nodes.push({
      x: anchor.x,
      y: anchor.y,
      handleInX: handleIn.x,
      handleInY: handleIn.y,
      handleOutX: handleOut.x,
      handleOutY: handleOut.y,
      type: classifyNodeType(handleIn, handleOut),
    });
  }

  return { nodes, closed: path.closed };
}

function classifyNodeType(
  handleIn: paper.Point,
  handleOut: paper.Point,
): 'corner' | 'smooth' | 'symmetric' {
  const inLen = Math.sqrt(handleIn.x * handleIn.x + handleIn.y * handleIn.y);
  const outLen = Math.sqrt(handleOut.x * handleOut.x + handleOut.y * handleOut.y);

  if (inLen < 0.01 && outLen < 0.01) return 'corner';

  if (inLen < 0.01 || outLen < 0.01) return 'corner';

  const inAngle = Math.atan2(handleIn.y, handleIn.x);
  const outAngle = Math.atan2(handleOut.y, handleOut.x);
  const angleDiff = Math.abs(((outAngle - inAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

  if (angleDiff > 0.1) return 'corner';

  if (Math.abs(inLen - outLen) < 0.5) return 'symmetric';

  return 'smooth';
}

export function vectorNodesToSvgPath(subpaths: Subpath[]): string {
  ensurePaper();

  if (subpaths.length === 0) return '';

  if (subpaths.length === 1) {
    const path = subpathToPaperPath(subpaths[0]!);
    const d = path.pathData;
    path.remove();
    return d;
  }

  const compound = new paper.CompoundPath({ insert: false });
  for (const subpath of subpaths) {
    const path = subpathToPaperPath(subpath);
    compound.addChild(path);
  }

  const d = compound.pathData;
  compound.remove();
  return d;
}

function subpathToPaperPath(subpath: Subpath): paper.Path {
  const segments: paper.Segment[] = subpath.nodes.map((node) => {
    return new paper.Segment(
      new paper.Point(node.x, node.y),
      new paper.Point(node.handleInX, node.handleInY),
      new paper.Point(node.handleOutX, node.handleOutY),
    );
  });

  const path = new paper.Path({ segments, insert: false });
  path.closed = subpath.closed;
  return path;
}

export function updateVectorNode(
  subpaths: Subpath[],
  subpathIndex: number,
  nodeIndex: number,
  updates: Partial<VectorNode>,
): Subpath[] {
  return subpaths.map((sp, si) => {
    if (si !== subpathIndex) return sp;
    return {
      ...sp,
      nodes: sp.nodes.map((n, ni) => {
        if (ni !== nodeIndex) return n;
        const updated = { ...n, ...updates };

        if (
          updated.type === 'symmetric' &&
          (updates.handleOutX !== undefined || updates.handleOutY !== undefined)
        ) {
          updated.handleInX = -updated.handleOutX;
          updated.handleInY = -updated.handleOutY;
        } else if (
          updated.type === 'symmetric' &&
          (updates.handleInX !== undefined || updates.handleInY !== undefined)
        ) {
          updated.handleOutX = -updated.handleInX;
          updated.handleOutY = -updated.handleInY;
        } else if (updated.type === 'smooth') {
          if (updates.handleOutX !== undefined || updates.handleOutY !== undefined) {
            const outLen = Math.sqrt(
              updated.handleOutX * updated.handleOutX + updated.handleOutY * updated.handleOutY,
            );
            if (outLen > 0.01) {
              const inLen = Math.sqrt(n.handleInX * n.handleInX + n.handleInY * n.handleInY);
              updated.handleInX = (-updated.handleOutX / outLen) * inLen;
              updated.handleInY = (-updated.handleOutY / outLen) * inLen;
            }
          } else if (updates.handleInX !== undefined || updates.handleInY !== undefined) {
            const inLen = Math.sqrt(
              updated.handleInX * updated.handleInX + updated.handleInY * updated.handleInY,
            );
            if (inLen > 0.01) {
              const outLen = Math.sqrt(n.handleOutX * n.handleOutX + n.handleOutY * n.handleOutY);
              updated.handleOutX = (-updated.handleInX / inLen) * outLen;
              updated.handleOutY = (-updated.handleInY / inLen) * outLen;
            }
          }
        }

        return updated;
      }),
    };
  });
}

export function addNodeToSubpath(
  subpaths: Subpath[],
  subpathIndex: number,
  afterNodeIndex: number,
  _position: { x: number; y: number },
): Subpath[] {
  ensurePaper();

  return subpaths.map((sp, si) => {
    if (si !== subpathIndex) return sp;

    const path = subpathToPaperPath(sp);
    const curves = path.curves;
    const curveIndex = afterNodeIndex;
    const curve = curves[curveIndex];

    if (!curve) {
      path.remove();
      const newNode: VectorNode = {
        x: _position.x,
        y: _position.y,
        handleInX: 0,
        handleInY: 0,
        handleOutX: 0,
        handleOutY: 0,
        type: 'corner',
      };
      const nodes = [...sp.nodes];
      nodes.splice(afterNodeIndex + 1, 0, newNode);
      return { ...sp, nodes };
    }

    const location = curve.getLocationAtTime(0.5);
    path.divideAt(location);

    const result = paperPathToSubpath(path);
    path.remove();
    return result;
  });
}

export function getSubpathMidpoints(
  subpath: Subpath,
): Array<{ afterNodeIndex: number; x: number; y: number }> {
  ensurePaper();

  if (subpath.nodes.length < 2) return [];

  const path = subpathToPaperPath(subpath);
  const results: Array<{ afterNodeIndex: number; x: number; y: number }> = [];

  for (let i = 0; i < path.curves.length; i++) {
    const curve = path.curves[i];
    if (!curve) continue;
    const midpoint = curve.getPointAtTime(0.5);
    results.push({ afterNodeIndex: i, x: midpoint.x, y: midpoint.y });
  }

  path.remove();
  return results;
}

export function deleteNodeFromSubpath(
  subpaths: Subpath[],
  subpathIndex: number,
  nodeIndex: number,
): Subpath[] {
  return subpaths
    .map((sp, si) => {
      if (si !== subpathIndex) return sp;
      if (sp.nodes.length <= 2) return null;
      const nodes = sp.nodes.filter((_, ni) => ni !== nodeIndex);
      return { ...sp, nodes };
    })
    .filter((sp): sp is Subpath => sp !== null);
}
