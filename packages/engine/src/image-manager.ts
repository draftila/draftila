import type * as Y from 'yjs';
import { addShape } from './scene-graph';

const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string): HTMLImageElement | null {
  return imageCache.get(src) ?? null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function clearImageCache() {
  imageCache.clear();
}

export async function addImageFromFile(
  ydoc: Y.Doc,
  file: File,
  x: number,
  y: number,
  parentId?: string | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxSize = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height);
          width *= scale;
          height *= scale;
        }

        const id = addShape(ydoc, 'image', {
          x,
          y,
          width,
          height,
          src: dataUrl,
          name: file.name,
          parentId: parentId ?? null,
        });

        imageCache.set(dataUrl, img);
        resolve(id);
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function addImageFromUrl(
  ydoc: Y.Doc,
  url: string,
  x: number,
  y: number,
  parentId?: string | null,
): Promise<string> {
  const img = await preloadImage(url);

  const maxSize = 800;
  let width = img.width;
  let height = img.height;

  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width *= scale;
    height *= scale;
  }

  return addShape(ydoc, 'image', {
    x,
    y,
    width,
    height,
    src: url,
    name: 'Image',
    parentId: parentId ?? null,
  });
}

export function handleFileDrop(
  ydoc: Y.Doc,
  files: FileList,
  canvasX: number,
  canvasY: number,
  parentId?: string | null,
): Promise<string[]> {
  const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const promises = imageFiles.map((file, i) =>
    addImageFromFile(ydoc, file, canvasX + i * 20, canvasY + i * 20, parentId),
  );
  return Promise.all(promises);
}
