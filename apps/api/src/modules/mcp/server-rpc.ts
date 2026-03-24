import './dom-shim';

import type * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import {
  addShape,
  getShape,
  updateShape,
  deleteShapes,
  getAllShapes,
  getChildShapes,
  duplicateShapesInPlace,
  groupShapes,
  ungroupShapes,
  frameSelection,
  alignShapes,
  distributeShapes,
  applyAutoLayout,
  applyAutoLayoutForAncestors,
  isAutoLayoutFrame,
  nudgeShapes,
  flipShapes,
  moveShapesInStack,
  moveShapesByDrop,
  applyBooleanOperation,
  createComponent,
  createInstance,
  listComponents,
  removeComponent,
  getPages,
  addPage,
  removePage,
  renamePage,
  setPageBackgroundColor,
  setActivePage,
  getPageGuides,
  addGuide,
  removeGuide,
  exportToSvg,
  importSvgShapes,
  Canvas2DRenderer,
  collectFontFamilies,
  setTextMeasureEnabled,
} from '@draftila/engine';
import type { BooleanOperation, StackMoveDirection, LayerDropPlacement } from '@draftila/engine';
import { renderShape } from '@draftila/engine';
import type { FrameShape } from '@draftila/shared';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as collaborationService from '../collaboration/collaboration.service';

setTextMeasureEnabled(false);

const FONT_CACHE_DIR = join(process.cwd(), '.cache', 'fonts');
const registeredFontFamilies = new Set<string>();
const CSS_GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);

function loadCachedFonts() {
  if (!existsSync(FONT_CACHE_DIR)) return;
  for (const file of readdirSync(FONT_CACHE_DIR).filter((f) => f.endsWith('.ttf'))) {
    const family = file.replace(/-\d+\.ttf$/, '').replace(/_/g, ' ');
    GlobalFonts.registerFromPath(join(FONT_CACHE_DIR, file), family);
    registeredFontFamilies.add(family);
  }
}

async function ensureServerFontsLoaded(families: string[]) {
  const toLoad = families.filter(
    (f) => !CSS_GENERIC_FAMILIES.has(f) && !registeredFontFamilies.has(f),
  );
  if (toLoad.length === 0) return;
  if (!existsSync(FONT_CACHE_DIR)) mkdirSync(FONT_CACHE_DIR, { recursive: true });
  await Promise.all(
    toLoad.map(async (family) => {
      const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
      await Promise.all(
        weights.map(async (weight) => {
          const fileName = `${family.replace(/\s+/g, '_')}-${weight}.ttf`;
          const filePath = join(FONT_CACHE_DIR, fileName);
          if (existsSync(filePath)) {
            GlobalFonts.registerFromPath(filePath, family);
            return;
          }
          try {
            const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
            const cssResp = await fetch(cssUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
            });
            if (!cssResp.ok) return;
            const css = await cssResp.text();
            const urlMatch = css.match(
              /src:\s*url\(([^)]+)\)\s*format\(['"](?:truetype|woff2?)['"]\)/,
            );
            if (!urlMatch?.[1]) return;
            const fontResp = await fetch(urlMatch[1]);
            if (!fontResp.ok) return;
            writeFileSync(filePath, Buffer.from(await fontResp.arrayBuffer()));
            GlobalFonts.registerFromPath(filePath, family);
          } catch {
            // ignore font download failures
          }
        }),
      );
      registeredFontFamilies.add(family);
    }),
  );
}

loadCachedFonts();

function renderWithClipping(renderer: InstanceType<typeof Canvas2DRenderer>, shapes: Shape[]) {
  const clipStack: string[] = [];
  const shapeMap = new Map(shapes.map((s) => [s.id, s]));

  for (const shape of shapes) {
    while (clipStack.length > 0) {
      const clipParentId = clipStack[clipStack.length - 1]!;
      let isDescendant = false;
      let checkId: string | null = shape.parentId ?? null;
      while (checkId) {
        if (checkId === clipParentId) {
          isDescendant = true;
          break;
        }
        const parent = shapeMap.get(checkId);
        checkId = parent?.parentId ?? null;
      }
      if (!isDescendant) {
        renderer.endClip();
        clipStack.pop();
      } else {
        break;
      }
    }

    renderShape(renderer, shape);

    if (shape.type === 'frame' && (shape as Shape & { clip?: boolean }).clip !== false) {
      const frame = shape as FrameShape;
      const hasIndependentCorners =
        frame.cornerRadiusTL !== undefined ||
        frame.cornerRadiusTR !== undefined ||
        frame.cornerRadiusBL !== undefined ||
        frame.cornerRadiusBR !== undefined;
      const clipRadii: number | [number, number, number, number] = hasIndependentCorners
        ? [
            frame.cornerRadiusTL ?? frame.cornerRadius,
            frame.cornerRadiusTR ?? frame.cornerRadius,
            frame.cornerRadiusBR ?? frame.cornerRadius,
            frame.cornerRadiusBL ?? frame.cornerRadius,
          ]
        : frame.cornerRadius;
      renderer.beginClip(shape.x, shape.y, shape.width, shape.height, shape.rotation, clipRadii);
      clipStack.push(shape.id);
    }
  }

  while (clipStack.length > 0) {
    renderer.endClip();
    clipStack.pop();
  }
}

async function serverExportToPng(
  shapes: Shape[],
  scale = 2,
  backgroundColor?: string | null,
): Promise<{ base64: string; mimeType: string }> {
  if (shapes.length === 0) throw new Error('No shapes to export');

  const families = collectFontFamilies(shapes);
  if (families.length > 0) await ensureServerFontsLoaded(families);

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const canvas = createCanvas(Math.ceil(width * scale), Math.ceil(height * scale));
  (canvas as unknown as Record<string, unknown>)['style'] = { width: '', height: '' };
  const renderer = new Canvas2DRenderer(canvas as unknown as HTMLCanvasElement);
  renderer.resize(width, height, scale);
  renderer.clear();

  if (backgroundColor) renderer.fillBackground(backgroundColor);

  renderer.save();
  renderer.applyCamera({ x: -minX, y: -minY, zoom: 1 });
  renderWithClipping(renderer, shapes);
  renderer.restore();

  const buffer = canvas.toBuffer('image/png');
  return { base64: Buffer.from(buffer).toString('base64'), mimeType: 'image/png' };
}

type Args = Record<string, unknown>;
type Handler = (ydoc: Y.Doc, args: Args) => unknown | Promise<unknown>;

function sortByDepth(ydoc: Y.Doc, parentIds: Set<string>): string[] {
  const depths = new Map<string, number>();
  for (const id of parentIds) {
    let depth = 0;
    let current = getShape(ydoc, id);
    while (current?.parentId) {
      depth++;
      current = getShape(ydoc, current.parentId);
    }
    depths.set(id, depth);
  }
  return [...parentIds].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
}

function collectShapesWithDescendants(allShapes: Shape[], rootIds: string[]): Shape[] {
  const rootSet = new Set(rootIds);
  const collected = new Set<string>();

  function addDescendants(id: string) {
    if (collected.has(id)) return;
    collected.add(id);
    for (const s of allShapes) {
      if (s.parentId === id) {
        addDescendants(s.id);
      }
    }
  }

  for (const id of rootIds) {
    addDescendants(id);
  }

  return allShapes.filter((s) => collected.has(s.id) || rootSet.has(s.id));
}

function toAbsoluteProps(ydoc: Y.Doc, props: Record<string, unknown>): Record<string, unknown> {
  const parentId = props['parentId'] as string | undefined;
  if (!parentId) return props;
  const parent = getShape(ydoc, parentId);
  if (!parent) return props;
  const out = { ...props };
  if (typeof out['x'] === 'number') out['x'] = (out['x'] as number) + parent.x;
  if (typeof out['y'] === 'number') out['y'] = (out['y'] as number) + parent.y;
  return out;
}

function applyTextDefaults(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  if (out['textAutoResize'] === undefined) out['textAutoResize'] = 'height';
  const fontSize = (out['fontSize'] as number) ?? 16;
  const lineHeight = (out['lineHeight'] as number) ?? 1.2;
  if (out['height'] === undefined) out['height'] = Math.ceil(fontSize * lineHeight);
  if (out['width'] === undefined) out['width'] = 200;
  return out;
}

function toRelativeShape(ydoc: Y.Doc, shape: Shape): Shape {
  if (!shape.parentId) return shape;
  const parent = getShape(ydoc, shape.parentId);
  if (!parent) return shape;
  return { ...shape, x: shape.x - parent.x, y: shape.y - parent.y };
}

const handlers: Record<string, Handler> = {
  create_shape(ydoc, args) {
    const type = args['type'] as ShapeType;
    let rawProps = (args['props'] ?? {}) as Record<string, unknown>;
    if (type === 'text') rawProps = applyTextDefaults(rawProps);
    const props = toAbsoluteProps(ydoc, rawProps);
    const idx = args['childIndex'] as number | undefined;
    const id = addShape(ydoc, type, props as Partial<Shape>, idx);
    applyAutoLayoutForAncestors(ydoc, id);
    return { shapeId: id };
  },

  get_shape(ydoc, args) {
    const shape = getShape(ydoc, args['shapeId'] as string);
    if (!shape) return { error: 'Shape not found' };
    return toRelativeShape(ydoc, shape);
  },

  update_shape(ydoc, args) {
    const shapeId = args['shapeId'] as string;
    const rawProps = args['props'] as Record<string, unknown>;
    const shape = getShape(ydoc, shapeId);
    if (!shape) return { error: 'Shape not found' };
    const props = (
      shape.parentId && (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
        ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
        : rawProps
    ) as Partial<Shape>;
    const before = getShape(ydoc, shapeId);
    updateShape(ydoc, shapeId, props);
    if (before && (typeof props.x === 'number' || typeof props.y === 'number')) {
      const after = getShape(ydoc, shapeId);
      if (after) {
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        if (dx !== 0 || dy !== 0) {
          const children = getChildShapes(ydoc, shapeId);
          if (children.length > 0) {
            nudgeShapes(
              ydoc,
              children.map((c) => c.id),
              dx,
              dy,
            );
          }
        }
      }
    }
    const updated = getShape(ydoc, shapeId);
    if (updated && isAutoLayoutFrame(updated)) {
      applyAutoLayout(ydoc, shapeId);
    }
    applyAutoLayoutForAncestors(ydoc, shapeId);
    return { ok: true };
  },

  delete_shapes(ydoc, args) {
    const shapeIds = args['shapeIds'] as string[];
    const parentIds = shapeIds
      .map((id) => getShape(ydoc, id)?.parentId)
      .filter((id): id is string => !!id);
    const uniqueParents = [...new Set(parentIds)];
    deleteShapes(ydoc, shapeIds);
    for (const parentId of uniqueParents) {
      const parent = getShape(ydoc, parentId);
      if (parent && isAutoLayoutFrame(parent)) {
        applyAutoLayout(ydoc, parentId);
      }
      applyAutoLayoutForAncestors(ydoc, parentId);
    }
    return { deletedIds: shapeIds };
  },

  list_shapes(ydoc, args) {
    const parentId = args['parentId'] as string | undefined;
    const recursive = args['recursive'] as boolean | undefined;
    const shapes = parentId ? getChildShapes(ydoc, parentId) : getAllShapes(ydoc);
    const relativeShapes = shapes.map((s) => toRelativeShape(ydoc, s));

    if (!recursive) {
      return { shapes: relativeShapes, count: relativeShapes.length };
    }

    const allShapes = getAllShapes(ydoc).map((s) => toRelativeShape(ydoc, s));
    const byParent = new Map<string | null, Shape[]>();
    for (const s of allShapes) {
      const pid = s.parentId ?? null;
      const list = byParent.get(pid);
      if (list) list.push(s);
      else byParent.set(pid, [s]);
    }

    type ShapeNode = Shape & { children?: ShapeNode[] };
    const buildTree = (pid: string | null): ShapeNode[] => {
      const children = byParent.get(pid) ?? [];
      return children.map((s) => {
        const kids = buildTree(s.id);
        return kids.length > 0 ? { ...s, children: kids } : { ...s };
      });
    };

    const roots = parentId ? buildTree(parentId) : buildTree(null);
    return { shapes: roots, count: roots.length };
  },

  duplicate_shapes(ydoc, args) {
    const map = duplicateShapesInPlace(ydoc, args['shapeIds'] as string[]);
    return { idMap: Object.fromEntries(map) };
  },

  batch_create_shapes(ydoc, args) {
    const shapes = args['shapes'] as Array<{
      type: string;
      props?: Record<string, unknown>;
      childIndex?: number;
    }>;
    const ids: string[] = [];
    const autoLayoutParents = new Set<string>();

    for (const shape of shapes) {
      let props = { ...(shape.props ?? {}) } as Record<string, unknown>;
      if (typeof props['parentId'] === 'string' && props['parentId'].startsWith('$')) {
        const refIdx = parseInt(props['parentId'].slice(1), 10);
        if (refIdx >= 0 && refIdx < ids.length) {
          props['parentId'] = ids[refIdx];
        }
      }
      if (shape.type === 'text') props = applyTextDefaults(props);
      const absProps = toAbsoluteProps(ydoc, props);
      const id = addShape(
        ydoc,
        shape.type as ShapeType,
        absProps as Partial<Shape>,
        shape.childIndex,
      );
      ids.push(id);
      if (typeof absProps['parentId'] === 'string') {
        const parentShape = getShape(ydoc, absProps['parentId']);
        if (parentShape && isAutoLayoutFrame(parentShape)) {
          autoLayoutParents.add(absProps['parentId']);
        }
      }
    }

    const sorted = sortByDepth(ydoc, autoLayoutParents);
    for (const parentId of sorted) {
      applyAutoLayout(ydoc, parentId);
    }
    for (const id of ids) {
      applyAutoLayoutForAncestors(ydoc, id);
    }

    return { shapeIds: ids, count: ids.length };
  },

  batch_update_shapes(ydoc, args) {
    const updates = args['updates'] as Array<{
      shapeId: string;
      props: Record<string, unknown>;
    }>;
    const affectedIds = new Set<string>();
    for (const update of updates) {
      const shape = getShape(ydoc, update.shapeId);
      const rawProps = update.props;
      const props =
        shape?.parentId && (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
          ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
          : rawProps;
      updateShape(ydoc, update.shapeId, props as Partial<Shape>);
      affectedIds.add(update.shapeId);
    }
    for (const id of affectedIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { ok: true };
  },

  group_shapes(ydoc, args) {
    const groupId = groupShapes(ydoc, args['shapeIds'] as string[]);
    return { groupId };
  },

  ungroup_shapes(ydoc, args) {
    const childIds = ungroupShapes(ydoc, args['shapeIds'] as string[]);
    return { childIds };
  },

  frame_selection(ydoc, args) {
    const frameId = frameSelection(ydoc, args['shapeIds'] as string[]);
    return { frameId };
  },

  align_shapes(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const shapeSet = new Set(args['shapeIds'] as string[]);
    const shapes = allShapes.filter((s) => shapeSet.has(s.id));
    type Alignment = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
    const updates = alignShapes(shapes, args['alignment'] as Alignment);
    for (const [id, pos] of updates) {
      updateShape(ydoc, id, pos as Partial<Shape>);
    }
    return { ok: true };
  },

  distribute_shapes(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const shapeSet = new Set(args['shapeIds'] as string[]);
    const shapes = allShapes.filter((s) => shapeSet.has(s.id));
    type Direction = 'horizontal' | 'vertical';
    const updates = distributeShapes(shapes, args['direction'] as Direction);
    for (const [id, pos] of updates) {
      updateShape(ydoc, id, pos as Partial<Shape>);
    }
    return { ok: true };
  },

  apply_auto_layout(ydoc, args) {
    applyAutoLayout(ydoc, args['frameId'] as string);
    return { ok: true };
  },

  nudge_shapes(ydoc, args) {
    const shapeIds = args['shapeIds'] as string[];
    nudgeShapes(ydoc, shapeIds, args['dx'] as number, args['dy'] as number);
    for (const id of shapeIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { ok: true };
  },

  flip_shapes(ydoc, args) {
    flipShapes(ydoc, args['shapeIds'] as string[], args['axis'] as 'horizontal' | 'vertical');
    return { ok: true };
  },

  move_in_stack(ydoc, args) {
    const movedIds = moveShapesInStack(
      ydoc,
      args['shapeIds'] as string[],
      args['direction'] as StackMoveDirection,
    );
    return { movedIds };
  },

  move_by_drop(ydoc, args) {
    const rawPlacement = args['placement'] as LayerDropPlacement;
    const enginePlacement: LayerDropPlacement =
      rawPlacement === 'before' ? 'after' : rawPlacement === 'after' ? 'before' : rawPlacement;
    const movedIds = moveShapesByDrop(
      ydoc,
      args['shapeIds'] as string[],
      args['targetId'] as string,
      enginePlacement,
    );
    for (const id of movedIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { movedIds };
  },

  boolean_operation(ydoc, args) {
    const resultId = applyBooleanOperation(
      ydoc,
      args['shapeIds'] as string[],
      args['operation'] as BooleanOperation,
    );
    return { resultId };
  },

  create_component(ydoc, args) {
    const componentId = createComponent(ydoc, args['shapeIds'] as string[], args['name'] as string);
    return { componentId };
  },

  create_instance(ydoc, args) {
    const rootIds = createInstance(
      ydoc,
      args['componentId'] as string,
      args['x'] as number,
      args['y'] as number,
      args['parentId'] as string | undefined,
    );
    return { rootIds };
  },

  list_components(ydoc) {
    const components = listComponents(ydoc);
    return { components };
  },

  remove_component(ydoc, args) {
    const removed = removeComponent(ydoc, args['componentId'] as string);
    return { ok: removed };
  },

  list_pages(ydoc) {
    const pages = getPages(ydoc);
    return { pages };
  },

  add_page(ydoc, args) {
    const pageId = addPage(ydoc, args['name'] as string | undefined);
    return { pageId };
  },

  remove_page(ydoc, args) {
    removePage(ydoc, args['pageId'] as string);
    return { ok: true };
  },

  rename_page(ydoc, args) {
    renamePage(ydoc, args['pageId'] as string, args['name'] as string);
    return { ok: true };
  },

  set_page_background(ydoc, args) {
    setPageBackgroundColor(ydoc, args['pageId'] as string, args['color'] as string | null);
    return { ok: true };
  },

  set_active_page(ydoc, args) {
    const success = setActivePage(ydoc, args['pageId'] as string);
    return { ok: success };
  },

  list_guides(ydoc, args) {
    const guides = getPageGuides(ydoc, args['pageId'] as string);
    return { guides };
  },

  add_guide(ydoc, args) {
    const guideId = addGuide(
      ydoc,
      args['pageId'] as string,
      args['axis'] as 'x' | 'y',
      args['position'] as number,
    );
    return { guideId };
  },

  remove_guide(ydoc, args) {
    removeGuide(ydoc, args['pageId'] as string, args['guideId'] as string);
    return { ok: true };
  },

  export_svg(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const ids = args['shapeIds'] as string[] | undefined;
    if (ids && ids.length > 0) {
      return exportToSvg(collectShapesWithDescendants(allShapes, ids));
    }
    return exportToSvg(allShapes);
  },

  async export_png(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const ids = args['shapeIds'] as string[] | undefined;
    const shapes = ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
    if (shapes.length === 0) return { error: 'No shapes to export' };
    const scale = (args['scale'] as number | undefined) ?? 1;
    const backgroundColor = args['backgroundColor'] as string | undefined;
    return serverExportToPng(shapes, scale, backgroundColor);
  },

  import_svg(ydoc, args) {
    const shapeIds = importSvgShapes(ydoc, args['svg'] as string, {
      targetParentId: (args['targetParentId'] as string | undefined) ?? undefined,
      cursorPosition:
        args['x'] !== undefined && args['y'] !== undefined
          ? { x: args['x'] as number, y: args['y'] as number }
          : undefined,
    });
    return { shapeIds };
  },
};

const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const roomLastAccess = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [draftId, lastAccess] of roomLastAccess) {
    if (now - lastAccess > ROOM_IDLE_TIMEOUT_MS) {
      const connectionCount = collaborationService.getConnectionCount(draftId);
      if (connectionCount === 0) {
        roomLastAccess.delete(draftId);
      }
    }
  }
}, 60_000);

async function serverRpcHandler(
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const room = await collaborationService.getOrCreateRoom(draftId);
  const handler = handlers[tool];
  if (!handler) throw new Error(`Unknown tool: ${tool}`);
  roomLastAccess.set(draftId, Date.now());
  return handler(room.ydoc, args);
}

export function initServerRpc() {
  collaborationService.setRpcInterceptor(serverRpcHandler);
}
