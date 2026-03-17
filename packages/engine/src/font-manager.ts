const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2';

const BUILTIN_FONTS = new Set([
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
]);

const loadedFonts = new Set<string>();
const pendingFonts = new Set<string>();
const fontLoadCallbacks = new Set<() => void>();

function buildGoogleFontsUrl(families: string[]): string {
  const params = families.map(
    (family) => `family=${encodeURIComponent(family)}:wght@100;200;300;400;500;600;700;800;900`,
  );
  return `${GOOGLE_FONTS_CSS_URL}?${params.join('&')}&display=swap`;
}

async function loadGoogleFonts(families: string[]): Promise<void> {
  if (families.length === 0) return;

  const url = buildGoogleFontsUrl(families);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;

  const loadPromise = new Promise<void>((resolve, reject) => {
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load fonts: ${families.join(', ')}`));
  });

  document.head.appendChild(link);

  try {
    await loadPromise;
    await document.fonts.ready;

    for (const family of families) {
      loadedFonts.add(family);
      pendingFonts.delete(family);
    }

    for (const callback of fontLoadCallbacks) {
      callback();
    }
  } catch {
    for (const family of families) {
      pendingFonts.delete(family);
    }
  }
}

export function ensureFontsLoaded(families: string[]): void {
  const toLoad: string[] = [];

  for (const family of families) {
    if (BUILTIN_FONTS.has(family)) continue;
    if (loadedFonts.has(family)) continue;
    if (pendingFonts.has(family)) continue;
    toLoad.push(family);
    pendingFonts.add(family);
  }

  if (toLoad.length > 0) {
    loadGoogleFonts(toLoad);
  }
}

export async function ensureFontsLoadedAsync(families: string[]): Promise<void> {
  const toLoad: string[] = [];

  for (const family of families) {
    if (BUILTIN_FONTS.has(family)) continue;
    if (loadedFonts.has(family)) continue;
    if (!pendingFonts.has(family)) {
      toLoad.push(family);
      pendingFonts.add(family);
    }
  }

  if (toLoad.length > 0) {
    await loadGoogleFonts(toLoad);
  }

  const stillPending = families.filter((f) => pendingFonts.has(f));
  if (stillPending.length > 0) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (stillPending.every((f) => !pendingFonts.has(f))) {
          fontLoadCallbacks.delete(check);
          resolve();
        }
      };
      fontLoadCallbacks.add(check);
      check();
    });
  }

  await document.fonts.ready;
}

export function onFontsLoaded(callback: () => void): () => void {
  fontLoadCallbacks.add(callback);
  return () => {
    fontLoadCallbacks.delete(callback);
  };
}

export function isFontLoaded(family: string): boolean {
  return BUILTIN_FONTS.has(family) || loadedFonts.has(family);
}

export function collectFontFamilies(
  shapes: Array<{ type: string; fontFamily?: string }>,
): string[] {
  const families = new Set<string>();
  for (const shape of shapes) {
    if (shape.type === 'text' && shape.fontFamily) {
      families.add(shape.fontFamily);
    }
  }
  return [...families];
}
