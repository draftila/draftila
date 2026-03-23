const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2';

const CSS_GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

const loadedFonts = new Set<string>();
const pendingFonts = new Set<string>();
const fontLoadCallbacks = new Set<() => void>();
const fontFamilyCache = new Map<string, string>();
let fontLoadingDoneListenerAdded = false;

function notifyFontCallbacks(): void {
  fontFamilyCache.clear();
  for (const callback of fontLoadCallbacks) {
    callback();
  }
}

function ensureFontLoadingDoneListener(): void {
  if (fontLoadingDoneListenerAdded) return;
  if (typeof document === 'undefined' || !document.fonts) return;
  fontLoadingDoneListenerAdded = true;
  document.fonts.addEventListener('loadingdone', () => {
    notifyFontCallbacks();
  });
}

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

    for (const family of families) {
      loadedFonts.add(family);
      pendingFonts.delete(family);
    }

    notifyFontCallbacks();
  } catch {
    for (const family of families) {
      pendingFonts.delete(family);
    }
  }
}

export function ensureFontsLoaded(families: string[]): void {
  ensureFontLoadingDoneListener();

  const toLoad: string[] = [];

  for (const family of families) {
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
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
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
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

export function resolveCanvasFontFamily(family: string): string {
  if (CSS_GENERIC_FAMILIES.has(family)) return family;

  const cached = fontFamilyCache.get(family);
  if (cached) return cached;

  if (family === 'Inter' && typeof document !== 'undefined' && document.fonts) {
    try {
      if (document.fonts.check('16px "Inter Variable"')) {
        const resolved = '"Inter Variable"';
        fontFamilyCache.set(family, resolved);
        return resolved;
      }
    } catch {
      // ignore
    }
  }

  const resolved = `"${family}"`;
  if (loadedFonts.has(family)) {
    fontFamilyCache.set(family, resolved);
  }
  return resolved;
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
