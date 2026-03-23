import type { Shape } from '@draftila/shared';
import { Canvas2DRenderer } from './renderer/canvas2d-renderer';
import type { Renderer } from './renderer/types';
import { renderShape } from './shape-renderer';
import { shapesToInterchange } from './interchange/converter';
import { generateSvg } from './interchange/svg/svg-generator';
import { collectFontFamilies, ensureFontsLoadedAsync } from './font-manager';

function renderWithClipping(renderer: Renderer, shapes: Shape[]) {
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
      renderer.beginClip(shape.x, shape.y, shape.width, shape.height, shape.rotation);
      clipStack.push(shape.id);
    }
  }

  while (clipStack.length > 0) {
    renderer.endClip();
    clipStack.pop();
  }
}

export async function exportToPng(
  shapes: Shape[],
  scale = 2,
  backgroundColor?: string | null,
): Promise<Blob> {
  if (shapes.length === 0) {
    throw new Error('No shapes to export');
  }

  const families = collectFontFamilies(shapes);
  if (families.length > 0) {
    await ensureFontsLoadedAsync(families);
  }

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

  const canvas = document.createElement('canvas');
  const renderer = new Canvas2DRenderer(canvas);
  renderer.resize(width, height, scale);
  renderer.clear();

  if (backgroundColor) {
    renderer.fillBackground(backgroundColor);
  }

  renderer.save();
  renderer.applyCamera({ x: -minX, y: -minY, zoom: 1 });

  renderWithClipping(renderer, shapes);

  renderer.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create PNG blob'));
      },
      'image/png',
      1,
    );
  });
}

export function exportToSvg(shapes: Shape[]): string {
  const doc = shapesToInterchange(shapes);
  return generateSvg(doc);
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  await downloadBlob(blob, filename);
}

export async function exportToJpg(
  shapes: Shape[],
  scale = 2,
  quality = 1,
  backgroundColor?: string | null,
): Promise<Blob> {
  if (shapes.length === 0) {
    throw new Error('No shapes to export');
  }

  const families = collectFontFamilies(shapes);
  if (families.length > 0) {
    await ensureFontsLoadedAsync(families);
  }

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

  const canvas = document.createElement('canvas');
  const renderer = new Canvas2DRenderer(canvas);
  renderer.resize(width, height, scale);
  renderer.clear();
  renderer.fillBackground(backgroundColor ?? '#ffffff');

  renderer.save();
  renderer.applyCamera({ x: -minX, y: -minY, zoom: 1 });

  renderWithClipping(renderer, shapes);

  renderer.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create JPEG blob'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function exportAndDownloadPng(
  shapes: Shape[],
  filename: string,
  scale = 2,
  backgroundColor?: string | null,
) {
  const blob = await exportToPng(shapes, scale, backgroundColor);
  await downloadBlob(blob, filename);
}

export async function exportAndDownloadJpg(
  shapes: Shape[],
  filename: string,
  scale = 2,
  quality = 1,
  backgroundColor?: string | null,
) {
  const blob = await exportToJpg(shapes, scale, quality, backgroundColor);
  await downloadBlob(blob, filename);
}

export async function exportAndDownloadSvg(shapes: Shape[], filename: string) {
  const svg = exportToSvg(shapes);
  await downloadSvg(svg, filename);
}
