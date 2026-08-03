import {
  canonicalVariantKey,
  getCustomFontFamilyRecord,
  isCustomFontFamily,
  isCustomFontsReady,
  nearestAvailableVariant,
  onCustomFontsChange,
  toNameKey,
  whenCustomFontsReady,
  type CustomFontVariant,
  type RegistryChange,
} from './custom-fonts';
import { isGoogleFontFamily } from './google-fonts';

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

/** Google families whose shared `<link>` load failed — terminal for the session. */
const failedGoogleFonts = new Set<string>();
/** Custom families seen before the registry was ready; replayed on every ready transition. */
const deferredFamilies = new Set<string>();
/** Per-face state, all keyed by `faceKey`. */
const loadedVariantKeys = new Set<string>();
const failedVariantKeys = new Set<string>();
/** In-flight OR settled. A settled `Promise<false>` is the terminal failure memo — never deleted here. */
const variantLoads = new Map<string, Promise<boolean>>();
const customFaces = new Map<string, FontFace>();

let registrySubscribed = false;
let unsubscribeRegistry: (() => void) | null = null;

function notifyFontCallbacks(): void {
  fontFamilyCache.clear();
  for (const callback of fontLoadCallbacks) {
    callback();
  }
}

/**
 * Lazy — deliberately NOT a module-init side effect. A top-level `onCustomFontsChange(...)` would
 * make module-evaluation order bundler-dependent and could crash at import time.
 */
function ensureRegistrySubscription(): void {
  if (registrySubscribed) return;
  registrySubscribed = true;
  unsubscribeRegistry = onCustomFontsChange(handleRegistryChange);
}

function ensureFontLoadingDoneListener(): void {
  ensureRegistrySubscription();
  if (fontLoadingDoneListenerAdded) return;
  if (typeof document === 'undefined' || !document.fonts) return;
  fontLoadingDoneListenerAdded = true;
  document.fonts.addEventListener('loadingdone', () => {
    notifyFontCallbacks();
  });
}

/** Env guard: server / dom-shim paths have no `FontFace`, so every custom-face path no-ops. */
const canUseFontFace = (): boolean =>
  typeof FontFace !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof document.fonts?.add === 'function';

/**
 * Face keys carry the RAW document spelling prefixed onto the canonical key, so a key always names
 * exactly the string its `FontFace` was created under (§2.1). Two spellings of one family therefore
 * get two faces; registry-driven eviction matches on the embedded canonical segment.
 */
function faceKey(family: string, v: CustomFontVariant): string {
  return `${family}|${canonicalVariantKey(family, v)}`;
}

function handleRegistryChange({ removedVariantKeys, changedFamilies }: RegistryChange): void {
  const matchesRemoved = (key: string) => removedVariantKeys.some((ck) => key.endsWith(`|${ck}`));

  for (const k of [...customFaces.keys()]) {
    if (!matchesRemoved(k)) continue;
    const face = customFaces.get(k)!;
    if (canUseFontFace()) document.fonts.delete(face);
    customFaces.delete(k);
    loadedVariantKeys.delete(k);
    failedVariantKeys.delete(k);
    variantLoads.delete(k); // a re-added variant starts fresh
  }

  for (const name of changedFamilies) {
    loadedFonts.delete(name);
    pendingFonts.delete(name);
    fontFamilyCache.delete(name);
    failedGoogleFonts.delete(name); // a name that became custom stops being a dead Google name
    const seg = `|${toNameKey(name)}|`;
    for (const k of [...failedVariantKeys]) {
      if (k.includes(seg)) {
        failedVariantKeys.delete(k);
        variantLoads.delete(k);
      }
    }
  }

  const replay = [...deferredFamilies];
  deferredFamilies.clear();
  if (replay.length > 0) ensureFontsLoaded(replay);

  notifyFontCallbacks();
}

function startVariantLoad(family: string, v: CustomFontVariant): Promise<boolean> {
  const k = faceKey(family, v);
  // The raw doc spelling — matches the key AND what `ctx.font` will request (§2.1).
  const face = new FontFace(family, `url("${v.url}")`, {
    weight: String(v.weight),
    style: v.style,
    // Matches the Google path's `&display=swap`. Without it faces default to `auto` (block), and
    // DOM consumers that set `font-family` with no generic fallback render invisible while loading.
    display: 'swap',
  });
  customFaces.set(k, face);
  document.fonts.add(face);

  const p = face.load().then(
    () => {
      if (customFaces.get(k) !== face) return false; // evicted mid-load — never mark loaded
      loadedVariantKeys.add(k);
      return true;
    },
    () => {
      // One corrupt file never rejects the batch. This NEVER deletes `variantLoads`: the settled
      // `Promise<false>` IS the terminal memo, and retries come only from the change listener.
      if (canUseFontFace()) document.fonts.delete(face);
      // Same identity guard as the success path: a stale face rejecting after eviction+re-add must
      // not mark the NEW key terminally failed.
      if (customFaces.get(k) !== face) return false;
      customFaces.delete(k);
      failedVariantKeys.add(k);
      return false;
    },
  );

  variantLoads.set(k, p);
  return p;
}

/**
 * FAMILY-granular: a used family loads ALL of its variants. Realistic Latin WOFF2 faces are
 * 20–100 KB, so a whole family is ~1 MB worst case.
 */
function loadCustomFamily(family: string): Promise<void> {
  const fam = getCustomFontFamilyRecord(family)!;
  if (!canUseFontFace()) {
    loadedFonts.add(family);
    return Promise.resolve();
  }

  const keys = fam.variants.map((v) => faceKey(family, v));
  // FAST PATH incl. terminal failures — this runs on every drag frame, so it must be a no-op.
  if (keys.every((k) => loadedVariantKeys.has(k) || failedVariantKeys.has(k))) {
    loadedFonts.add(family);
    return Promise.resolve();
  }

  const parts = fam.variants.map((v) => {
    const k = faceKey(family, v);
    const existing = variantLoads.get(k); // dedupe; settled failures reuse their Promise<false>
    return { fresh: !existing, p: existing ?? startVariantLoad(family, v) };
  });

  return Promise.all(parts.map((r) => r.p)).then((usable) => {
    loadedFonts.add(family);
    // Notify ONLY on a face this call freshly resolved — an unconditional notify creates an
    // infinite reentrant loop with `reconcileTextShapes`.
    if (usable.some((ok, i) => ok && parts[i]!.fresh)) notifyFontCallbacks();
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
    // Google's CSS2 endpoint 400s the WHOLE batch if any single `family=` is unknown, so a curated
    // name is only worth retrying when an unknown name could have poisoned the request. An
    // all-curated batch that failed is a transport failure and will fail identically forever —
    // leaving those names unmemoized loops without bound, because the notify below re-enters
    // `ensureFontsLoaded*` through subscribers like `reconcileTextShapes`, which finds the name
    // neither loaded, pending, nor failed and appends another <link>. Bounded at two attempts:
    // the retry batch is all-curated, so its failure is terminal.
    const poisoned = families.some((family) => !isGoogleFontFamily(family));
    for (const family of families) {
      pendingFonts.delete(family);
      if (!poisoned || !isGoogleFontFamily(family)) failedGoogleFonts.add(family);
    }
    // Settles every parked `stillPending` waiter in `ensureFontsLoadedAsync`.
    notifyFontCallbacks();
  }
}

export function ensureFontsLoaded(families: string[]): void {
  ensureRegistrySubscription();
  ensureFontLoadingDoneListener();

  const google: string[] = [];

  for (const family of families) {
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
    // Custom-first classification MUST run before the loadedFonts/pendingFonts short-circuits,
    // otherwise a custom family stays shadowed by a Google <link> that 200'd for the same name.
    if (isCustomFontFamily(family)) {
      void loadCustomFamily(family);
      continue;
    }
    // Pre-ready, an unknown name might turn out to be custom.
    if (!isCustomFontsReady() && !isGoogleFontFamily(family)) {
      deferredFamilies.add(family);
      continue;
    }
    if (loadedFonts.has(family) || pendingFonts.has(family) || failedGoogleFonts.has(family)) {
      continue;
    }
    google.push(family);
    pendingFonts.add(family);
  }

  if (google.length > 0) void loadGoogleFonts(google);
}

export async function ensureFontsLoadedAsync(families: string[]): Promise<void> {
  ensureRegistrySubscription();

  // 5 s failsafe on EXPORT paths only: degrade, never hang.
  if (requiresCustomFontRegistry(families) && !isCustomFontsReady()) {
    await whenCustomFontsReady({ timeoutMs: 5000 });
  }

  const google: string[] = [];
  const customLoads: Array<Promise<void>> = [];

  for (const family of families) {
    if (CSS_GENERIC_FAMILIES.has(family)) continue;
    if (isCustomFontFamily(family)) {
      customLoads.push(loadCustomFamily(family));
      continue;
    }
    if (!isCustomFontsReady() && !isGoogleFontFamily(family)) {
      deferredFamilies.add(family);
      continue;
    }
    if (loadedFonts.has(family) || pendingFonts.has(family) || failedGoogleFonts.has(family)) {
      continue;
    }
    google.push(family);
    pendingFonts.add(family);
  }

  if (google.length > 0) await loadGoogleFonts(google);
  await Promise.all(customLoads); // cannot reject — per-face handling above

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

  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
}

export const requiresCustomFontRegistry = (families: string[]): boolean =>
  families.some((f) => !CSS_GENERIC_FAMILIES.has(f) && !isGoogleFontFamily(f));

export const isFontLoaded = (family: string): boolean => loadedFonts.has(family);

/**
 * Picker-local: starts ONE variant load (nearest to 400/normal) instead of the whole family. The
 * picker is the one path that loads families the document never uses — the preview effect fires per
 * virtualized row, so `ensureFontsLoaded` there would construct hundreds of faces on a single
 * scroll gesture.
 */
export function loadCustomFontPreview(family: string): void {
  const fam = getCustomFontFamilyRecord(family);
  if (!fam || fam.variants.length === 0 || !canUseFontFace()) return;
  const target = nearestAvailableVariant(family, 400, 'normal');
  const variant = fam.variants.find((v) => v.weight === target.weight && v.style === target.style);
  if (!variant) return;
  const k = faceKey(family, variant);
  if (variantLoads.has(k)) return;
  // Notify on success: a later `loadCustomFamily` for this family sees `fresh: false` for the face
  // this call started and would otherwise skip the re-measure tick entirely.
  void startVariantLoad(family, variant).then((ok) => {
    if (ok) notifyFontCallbacks();
  });
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
  shapes: Array<{
    type: string;
    fontFamily?: string;
    segments?: Array<{ fontFamily?: string }>;
  }>,
): string[] {
  const families = new Set<string>();
  for (const shape of shapes) {
    if (shape.type !== 'text') continue;
    if (shape.fontFamily) families.add(shape.fontFamily);
    for (const segment of shape.segments ?? []) {
      if (segment.fontFamily) families.add(segment.fontFamily);
    }
  }
  return [...families];
}

/** Test-only: reinitialize all module state. */
export function __resetFontManagerState(): void {
  loadedFonts.clear();
  pendingFonts.clear();
  fontLoadCallbacks.clear();
  fontFamilyCache.clear();
  fontLoadingDoneListenerAdded = false;
  failedGoogleFonts.clear();
  deferredFamilies.clear();
  loadedVariantKeys.clear();
  failedVariantKeys.clear();
  variantLoads.clear();
  customFaces.clear();
  unsubscribeRegistry?.();
  unsubscribeRegistry = null;
  registrySubscribed = false;
}
