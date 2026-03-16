import type { Shape } from '@draftila/shared';
import { Canvas2DRenderer } from './renderer/canvas2d-renderer';
import { renderShape } from './shape-renderer';
import { shapesToSvg } from './figma-clipboard';

export function exportToPng(shapes: Shape[], scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (shapes.length === 0) {
      reject(new Error('No shapes to export'));
      return;
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

    const padding = 16;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const canvas = document.createElement('canvas');
    const renderer = new Canvas2DRenderer(canvas);
    renderer.resize(width, height, scale);
    renderer.clear();
    renderer.save();
    renderer.applyCamera({ x: -minX + padding, y: -minY + padding, zoom: 1 });

    for (const shape of shapes) {
      renderShape(renderer, shape);
    }

    renderer.restore();

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
  return shapesToSvg(shapes);
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

export async function exportAndDownloadPng(shapes: Shape[], filename: string, scale = 2) {
  const blob = await exportToPng(shapes, scale);
  await downloadBlob(blob, filename);
}

export async function exportAndDownloadSvg(shapes: Shape[], filename: string) {
  const svg = exportToSvg(shapes);
  await downloadSvg(svg, filename);
}
