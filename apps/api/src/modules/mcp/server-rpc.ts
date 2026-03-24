import './dom-shim';

import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getAllShapes,
  Canvas2DRenderer,
  collectFontFamilies,
  renderWithClipping,
  setTextMeasureEnabled,
} from '@draftila/engine';
import type { RpcHandler } from '@draftila/engine/rpc-handlers';
import { createRpcHandlers, collectShapesWithDescendants } from '@draftila/engine/rpc-handlers';
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

function collectUsedWeights(shapes: Shape[]): Map<string, Set<number>> {
  const familyWeights = new Map<string, Set<number>>();
  for (const shape of shapes) {
    if (shape.type !== 'text') continue;
    const family = (shape as Shape & { fontFamily?: string }).fontFamily;
    const weight = (shape as Shape & { fontWeight?: number }).fontWeight ?? 400;
    if (!family) continue;
    const weights = familyWeights.get(family);
    if (weights) {
      weights.add(weight);
    } else {
      familyWeights.set(family, new Set([weight]));
    }
  }
  return familyWeights;
}

async function ensureServerFontsLoaded(shapes: Shape[]) {
  const familyWeights = collectUsedWeights(shapes);
  const toLoad: Array<{ family: string; weights: number[] }> = [];

  for (const [family, weights] of familyWeights) {
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
    if (registeredFontFamilies.has(family)) continue;
    toLoad.push({ family, weights: [...weights] });
  }

  if (toLoad.length === 0) return;
  if (!existsSync(FONT_CACHE_DIR)) mkdirSync(FONT_CACHE_DIR, { recursive: true });

  await Promise.all(
    toLoad.map(async ({ family, weights }) => {
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

async function serverExportToPng(
  shapes: Shape[],
  scale = 2,
  backgroundColor?: string | null,
): Promise<{ base64: string; mimeType: string }> {
  if (shapes.length === 0) throw new Error('No shapes to export');

  await ensureServerFontsLoaded(shapes);

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

const exportPngHandler: RpcHandler = async (ydoc: Y.Doc, args) => {
  const allShapes = getAllShapes(ydoc);
  const ids = args['shapeIds'] as string[] | undefined;
  const shapes = ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
  if (shapes.length === 0) return { error: 'No shapes to export' };
  const scale = (args['scale'] as number | undefined) ?? 1;
  const backgroundColor = args['backgroundColor'] as string | undefined;
  return serverExportToPng(shapes, scale, backgroundColor);
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
