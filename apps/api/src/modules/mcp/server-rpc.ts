import './dom-shim';

import type * as Y from 'yjs';
import type { FontFamilyDto, Shape, TextShape } from '@draftila/shared';
import {
  getResolvedShapes,
  getShape,
  Canvas2DRenderer,
  collectFontFamilies,
  collectImageSources,
  mapDtoToEngine,
  preloadImages,
  registerCustomFonts,
  renderWithClipping,
  setCustomFontDataProvider,
  setImageCacheLimit,
  setImageLoader,
  toNameKey,
} from '@draftila/engine';
import type { RpcHandler } from '@draftila/engine/rpc-handlers';
import { createRpcHandlers, collectShapesWithDescendants } from '@draftila/engine/rpc-handlers';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { FontKey } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { extractStorageKey, getStoragePath } from '../../common/lib/storage';
import * as collaborationService from '../collaboration/collaboration.service';
import * as fontsService from '../fonts/fonts.service';
import { loadServerImage } from './image-loader';

const IMAGE_CACHE_LIMIT_BYTES = 128 * 1024 * 1024;
const IMAGE_PRELOAD_LIMIT = 200;
const IMAGE_PRELOAD_TIMEOUT_MS = 30_000;

setImageLoader(loadServerImage);
setImageCacheLimit(IMAGE_CACHE_LIMIT_BYTES);

const FONT_CACHE_DIR = join(process.cwd(), '.cache', 'fonts');
const registeredFontVariants = new Set<string>();
/**
 * Every skia key the Google path registered, by the family string it was registered under. Custom
 * registration purges these so a `.cache/fonts` entry with the same name cannot shadow the custom
 * family non-deterministically.
 */
const googleFontKeys = new Map<string, FontKey[]>();
const CSS_GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);

interface CustomFamilyRegistration {
  /** `family.updatedAt` at registration time — the invalidation token (§1.1). */
  updatedAt: string;
  /** Keys per registered alias; a family used under two spellings has two aliases (§2.1). */
  keysByAlias: Map<string, FontKey[]>;
}

/** Per-process cache, keyed by `toNameKey(name)`. */
const customFamilies = new Map<string, CustomFamilyRegistration>();

function rememberGoogleKey(family: string, key: FontKey | null) {
  if (!key) return;
  const keys = googleFontKeys.get(family);
  if (keys) keys.push(key);
  else googleFontKeys.set(family, [key]);
}

function loadCachedFonts() {
  if (!existsSync(FONT_CACHE_DIR)) return;
  for (const file of readdirSync(FONT_CACHE_DIR).filter((f) => f.endsWith('.ttf'))) {
    const family = file.replace(/-\d+\.ttf$/, '').replace(/_/g, ' ');
    const weightMatch = file.match(/-(\d+)\.ttf$/);
    const weight = Number(weightMatch?.[1]);
    rememberGoogleKey(family, GlobalFonts.registerFromPath(join(FONT_CACHE_DIR, file), family));
    if (!Number.isNaN(weight)) {
      registeredFontVariants.add(`${family}:${weight}`);
    }
  }
}

function collectUsedWeights(shapes: Shape[]): Map<string, Set<number>> {
  const familyWeights = new Map<string, Set<number>>();
  const add = (family: string | undefined, weight: number) => {
    if (!family) return;
    const weights = familyWeights.get(family);
    if (weights) {
      weights.add(weight);
    } else {
      familyWeights.set(family, new Set([weight]));
    }
  };

  for (const shape of shapes) {
    if (shape.type !== 'text') continue;
    const text = shape as TextShape;
    const baseWeight = text.fontWeight ?? 400;
    add(text.fontFamily, baseWeight);
    for (const segment of text.segments ?? []) {
      add(segment.fontFamily ?? text.fontFamily, segment.fontWeight ?? baseWeight);
    }
  }
  return familyWeights;
}

/**
 * Drops any Google-path registration made under `name`, so it cannot shadow the custom family.
 * Keyed by the DOCUMENT string, which is what both paths register under.
 */
function purgeGoogleRegistration(name: string) {
  const keys = googleFontKeys.get(name);
  if (keys && keys.length > 0) GlobalFonts.removeBatch(keys);
  googleFontKeys.delete(name);
  for (const variantKey of [...registeredFontVariants]) {
    if (variantKey.startsWith(`${name}:`)) registeredFontVariants.delete(variantKey);
  }
}

/**
 * Registers every variant of the custom family `name`, if one exists, and reports whether the
 * Google path should be skipped for it (custom wins over Google).
 *
 * The alias is the LITERAL document string, never `fam.name`: the renderer asks skia for the
 * shape's own `fontFamily` spelling (`resolveCanvasFontFamily`), so registering under a
 * differently-normalized spelling makes the server silently render fallback (§2.1). The stored
 * file is registered as-is — WOFF/WOFF2 included, which `@napi-rs/canvas` handles.
 */
async function ensureCustomFamilyRegistered(name: string): Promise<boolean> {
  const nameKey = toNameKey(name);
  // This per-export lookup IS the invalidation mechanism: `family.updatedAt` is bumped explicitly
  // on every variant mutation.
  const fam = await fontsService.getFamilyByNameKey(nameKey);
  const cached = customFamilies.get(nameKey);

  if (!fam || fam.variants.length === 0) {
    if (cached) {
      for (const keys of cached.keysByAlias.values()) GlobalFonts.removeBatch(keys);
      customFamilies.delete(nameKey);
    }
    return false;
  }

  const updatedAt = fam.updatedAt.toISOString();
  if (cached?.updatedAt === updatedAt && cached.keysByAlias.has(name)) return true;

  purgeGoogleRegistration(name);

  let entry = cached;
  if (!entry || entry.updatedAt !== updatedAt) {
    if (entry) for (const keys of entry.keysByAlias.values()) GlobalFonts.removeBatch(keys);
    entry = { updatedAt, keysByAlias: new Map() };
    customFamilies.set(nameKey, entry);
  }

  const keys: FontKey[] = [];
  for (const variant of fam.variants) {
    try {
      const path = join(getStoragePath(), extractStorageKey(variant.fileUrl));
      const key = GlobalFonts.registerFromPath(path, name);
      if (key) keys.push(key);
      else console.warn(`Custom font variant not renderable: ${variant.fileUrl}`);
    } catch (err) {
      // A missing or corrupt file skips that variant; it never aborts the export.
      console.warn(`Failed to register custom font variant ${variant.fileUrl}:`, err);
    }
  }
  entry.keysByAlias.set(name, keys);
  return true;
}

async function ensureFontVariantsRegistered(familyWeights: Map<string, Set<number>>) {
  const toLoad: Array<{ family: string; weights: number[] }> = [];

  for (const [family, weights] of familyWeights) {
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
    // Custom-first classification. Registration covers ALL variants of the family, so used
    // weights play no part here.
    if (await ensureCustomFamilyRegistered(family)) continue;
    const missingWeights = [...weights].filter(
      (weight) => !registeredFontVariants.has(`${family}:${weight}`),
    );
    if (missingWeights.length === 0) continue;
    toLoad.push({ family, weights: missingWeights });
  }

  if (toLoad.length === 0) return;
  if (!existsSync(FONT_CACHE_DIR)) mkdirSync(FONT_CACHE_DIR, { recursive: true });

  await Promise.all(
    toLoad.map(async ({ family, weights }) => {
      await Promise.all(
        weights.map(async (weight) => {
          const fileName = `${family.replace(/\s+/g, '_')}-${weight}.ttf`;
          const filePath = join(FONT_CACHE_DIR, fileName);
          const variantKey = `${family}:${weight}`;
          if (existsSync(filePath)) {
            rememberGoogleKey(family, GlobalFonts.registerFromPath(filePath, family));
            registeredFontVariants.add(variantKey);
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
            rememberGoogleKey(family, GlobalFonts.registerFromPath(filePath, family));
            registeredFontVariants.add(variantKey);
          } catch {
            // ignore font download failures
          }
        }),
      );
    }),
  );
}

async function ensureServerFontsLoaded(shapes: Shape[]) {
  await ensureFontVariantsRegistered(collectUsedWeights(shapes));
}

const TEXT_MEASURE_TOOLS = new Set([
  'create_shape',
  'batch_create_shapes',
  'update_shape',
  'batch_update_shapes',
  'import_html',
  'import_svg',
]);

const NAMED_FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

function mergeFamilyWeights(target: Map<string, Set<number>>, source: Map<string, Set<number>>) {
  for (const [family, weights] of source) {
    const existing = target.get(family);
    if (existing) {
      for (const weight of weights) existing.add(weight);
    } else {
      target.set(family, new Set(weights));
    }
  }
}

function collectFontRequestsFromMarkup(markup: string): Map<string, Set<number>> {
  const families = new Set<string>(['Inter']);
  for (const match of markup.matchAll(/font-\[['"]?([^'"\]]+)['"]?\]/g)) {
    const family = match[1]?.trim();
    if (family) families.add(family);
  }
  for (const match of markup.matchAll(/font-family\s*[:=]\s*["']?([^"';,<>]+)/g)) {
    const family = match[1]?.trim();
    if (family) families.add(family);
  }

  const weights = new Set<number>([400]);
  for (const match of markup.matchAll(
    /font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  )) {
    const weight = NAMED_FONT_WEIGHTS[match[1] ?? ''];
    if (weight) weights.add(weight);
  }
  for (const match of markup.matchAll(/font-weight\s*[:=]\s*["']?(\d{3})\b/g)) {
    weights.add(Number(match[1]));
  }
  if (/<(strong|b)[\s>]/.test(markup)) weights.add(700);

  const familyWeights = new Map<string, Set<number>>();
  for (const family of families) familyWeights.set(family, new Set(weights));
  return familyWeights;
}

function collectFontRequestsFromArgs(args: Record<string, unknown>): Map<string, Set<number>> {
  const familyWeights = new Map<string, Set<number>>();
  const add = (family: unknown, weight: unknown) => {
    if (typeof family !== 'string' || family.length === 0) return;
    const resolvedWeight = typeof weight === 'number' ? weight : 400;
    const weights = familyWeights.get(family);
    if (weights) {
      weights.add(resolvedWeight);
    } else {
      familyWeights.set(family, new Set([resolvedWeight]));
    }
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const isTextLike =
      record['type'] === 'text' ||
      typeof record['content'] === 'string' ||
      typeof record['fontFamily'] === 'string' ||
      typeof record['fontWeight'] === 'number' ||
      Array.isArray(record['segments']);
    if (isTextLike) {
      const family = typeof record['fontFamily'] === 'string' ? record['fontFamily'] : 'Inter';
      const weight = typeof record['fontWeight'] === 'number' ? record['fontWeight'] : 400;
      add(family, weight);
      if (Array.isArray(record['segments'])) {
        for (const segment of record['segments']) {
          if (!segment || typeof segment !== 'object') continue;
          const seg = segment as Record<string, unknown>;
          add(seg['fontFamily'] ?? family, seg['fontWeight'] ?? weight);
        }
      }
    }
    for (const nested of Object.values(record)) visit(nested);
  };

  if (args['type'] === 'text') {
    visit({ type: 'text', ...(args['props'] as Record<string, unknown> | undefined) });
  }
  visit(args['shapes']);
  for (const key of ['html', 'svg']) {
    const markup = args[key];
    if (typeof markup === 'string' && markup.length > 0) {
      mergeFamilyWeights(familyWeights, collectFontRequestsFromMarkup(markup));
    }
  }
  return familyWeights;
}

function collectUpdateFontRequests(
  ydoc: Y.Doc,
  tool: string,
  args: Record<string, unknown>,
): Map<string, Set<number>> {
  const updatedTextShapes: Shape[] = [];
  const collect = (shapeId: unknown, props: unknown) => {
    if (typeof shapeId !== 'string') return;
    const shape = getShape(ydoc, shapeId);
    if (!shape || shape.type !== 'text') return;
    const patch = props && typeof props === 'object' ? (props as Record<string, unknown>) : {};
    updatedTextShapes.push({ ...shape, ...patch } as Shape);
  };

  if (tool === 'update_shape') {
    collect(args['shapeId'], args['props']);
  }
  if (tool === 'batch_update_shapes' && Array.isArray(args['updates'])) {
    for (const update of args['updates']) {
      if (!update || typeof update !== 'object') continue;
      const entry = update as Record<string, unknown>;
      collect(entry['shapeId'], entry['props']);
    }
  }
  return collectUsedWeights(updatedTextShapes);
}

loadCachedFonts();

const MAX_OUTPUT_PIXELS = 4096 * 4096;

interface ExportRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function shapeEffectExpansion(shape: Shape): number {
  let expansion = 0;
  if ('strokes' in shape && Array.isArray(shape.strokes)) {
    for (const stroke of shape.strokes) {
      if (stroke.visible === false) continue;
      if (stroke.align === 'outside') expansion = Math.max(expansion, stroke.width);
      else if (stroke.align !== 'inside') expansion = Math.max(expansion, stroke.width / 2);
    }
  }
  if ('shadows' in shape && Array.isArray(shape.shadows)) {
    for (const shadow of shape.shadows) {
      if (shadow.visible === false || shadow.type === 'inner') continue;
      expansion = Math.max(
        expansion,
        Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) + shadow.blur + Math.max(shadow.spread, 0),
      );
    }
  }
  return expansion;
}

function computeExportBounds(shapes: Shape[]): ExportRegion {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const s of shapes) {
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    const rad = ((s.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const expansion = shapeEffectExpansion(s);
    const corners: Array<[number, number]> = [
      [s.x - expansion, s.y - expansion],
      [s.x + s.width + expansion, s.y - expansion],
      [s.x - expansion, s.y + s.height + expansion],
      [s.x + s.width + expansion, s.y + s.height + expansion],
    ];
    for (const [x, y] of corners) {
      const rotatedX = cx + (x - cx) * cos - (y - cy) * sin;
      const rotatedY = cy + (x - cx) * sin + (y - cy) * cos;
      minX = Math.min(minX, rotatedX);
      minY = Math.min(minY, rotatedY);
      maxX = Math.max(maxX, rotatedX);
      maxY = Math.max(maxY, rotatedY);
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

async function serverExportToPng(
  shapes: Shape[],
  scale = 2,
  backgroundColor?: string | null,
  region?: ExportRegion,
  padding = 0,
): Promise<{ base64: string; mimeType: string }> {
  if (shapes.length === 0) throw new Error('No shapes to export');

  await ensureServerFontsLoaded(shapes);
  const preloaded = await preloadImages(collectImageSources(shapes), {
    limit: IMAGE_PRELOAD_LIMIT,
    timeoutMs: IMAGE_PRELOAD_TIMEOUT_MS,
  });
  if (preloaded.skipped > 0) {
    console.warn(
      `export_png skipped ${preloaded.skipped} of ${preloaded.requested} images (limit ${IMAGE_PRELOAD_LIMIT}, timeout ${IMAGE_PRELOAD_TIMEOUT_MS}ms)`,
    );
  }

  const bounds = region ?? computeExportBounds(shapes);
  const minX = bounds.x - padding;
  const minY = bounds.y - padding;
  const width = Math.max(1, bounds.width + padding * 2);
  const height = Math.max(1, bounds.height + padding * 2);

  let effectiveScale = scale;
  if (width * height * scale * scale > MAX_OUTPUT_PIXELS) {
    effectiveScale = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
  }

  const canvas = createCanvas(
    Math.max(1, Math.ceil(width * effectiveScale)),
    Math.max(1, Math.ceil(height * effectiveScale)),
  );
  (canvas as unknown as Record<string, unknown>)['style'] = { width: '', height: '' };
  const renderer = new Canvas2DRenderer(canvas as unknown as HTMLCanvasElement);
  renderer.resize(width, height, effectiveScale);
  renderer.clear();

  if (backgroundColor) renderer.fillBackground(backgroundColor);

  renderer.save();
  renderer.applyCamera({ x: -minX, y: -minY, zoom: 1 });
  renderWithClipping(renderer, shapes);
  renderer.restore();

  const buffer = canvas.toBuffer('image/png');
  return { base64: Buffer.from(buffer).toString('base64'), mimeType: 'image/png' };
}

const exportPngHandler: RpcHandler = async (ydoc: Y.Doc, args) => {
  const allShapes = getResolvedShapes(ydoc);
  const ids = args['shapeIds'] as string[] | undefined;
  const shapes = ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
  if (shapes.length === 0) return { error: 'No shapes to export' };
  const scale = (args['scale'] as number | undefined) ?? 1;
  const backgroundColor = args['backgroundColor'] as string | undefined;
  const x = args['x'] as number | undefined;
  const y = args['y'] as number | undefined;
  const width = args['width'] as number | undefined;
  const height = args['height'] as number | undefined;
  const region =
    x !== undefined && y !== undefined && width !== undefined && height !== undefined
      ? { x, y, width, height }
      : undefined;
  const padding = (args['padding'] as number | undefined) ?? 0;
  return serverExportToPng(shapes, scale, backgroundColor, region, padding);
};

const handlers = createRpcHandlers({ export_png: exportPngHandler });

const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const roomLastAccess = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [draftId, lastAccess] of roomLastAccess) {
    if (now - lastAccess > ROOM_IDLE_TIMEOUT_MS) {
      roomLastAccess.delete(draftId);
      collaborationService.closeRoom(draftId);
    }
  }
}, 60_000);

let customFontRegistryToken: string | null = null;

/**
 * Mirrors the font families table into the engine registry. Runs for EVERY tool, not just the
 * image exports: the codegen tools' custom-font comment headers ask `isCustomFontFamily()`, which
 * answers `false` on an unhydrated registry. The table is tiny and the version token keeps repeat
 * calls to a single SELECT.
 */
async function hydrateCustomFontRegistry(): Promise<void> {
  const rows = await fontsService.listFamilies();
  let maxUpdatedAt = 0;
  for (const row of rows) maxUpdatedAt = Math.max(maxUpdatedAt, row.updatedAt.getTime());
  const token = `${rows.length}:${maxUpdatedAt}`;
  if (token === customFontRegistryToken) return;
  customFontRegistryToken = token;
  registerCustomFonts(mapDtoToEngine(rows as unknown as FontFamilyDto[]));
}

async function serverRpcHandler(
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  await hydrateCustomFontRegistry();
  const room = await collaborationService.getOrCreateRoom(draftId);
  const handler = handlers[tool];
  if (!handler) throw new Error(`Unknown tool: ${tool}`);
  roomLastAccess.set(draftId, Date.now());
  if (TEXT_MEASURE_TOOLS.has(tool)) {
    const requests =
      tool === 'update_shape' || tool === 'batch_update_shapes'
        ? collectUpdateFontRequests(room.ydoc, tool, args)
        : collectFontRequestsFromArgs(args);
    if (requests.size > 0) await ensureFontVariantsRegistered(requests);
  }
  return handler(room.ydoc, args);
}

export function initServerRpc() {
  // No DB access here — this runs at import time, before the database is reachable.
  setCustomFontDataProvider((v) =>
    Bun.file(join(getStoragePath(), extractStorageKey(v.url))).bytes(),
  );
  collaborationService.setRpcInterceptor(serverRpcHandler);
}
