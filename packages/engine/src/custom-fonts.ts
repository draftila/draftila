// Registry of admin-uploaded custom font families.
//
// IMPORT DISCIPLINE: this module is a LEAF. It imports only types from `@draftila/shared`.
// It must NEVER import `font-manager.ts` (which imports this module) — a cross-import would make
// module-evaluation order bundler-dependent and can crash at boot with a TDZ `ReferenceError`.

import type { FontFamilyDto, Shape, TextShape } from '@draftila/shared';

export interface CustomFontVariant {
  weight: number;
  style: 'normal' | 'italic';
  url: string;
  format: string;
  /** Declared byte size when known — lets the embed budget be decided before any bytes are read. */
  fileSize?: number;
}

export interface CustomFontFamily {
  name: string;
  variants: CustomFontVariant[];
}

export interface RegistryChange {
  /** Canonical variant keys that no longer exist. */
  removedVariantKeys: string[];
  /** Display names of families that were added, removed, or whose variant set changed. */
  changedFamilies: string[];
}

/** Lookup identity: DB rows, registry map keys, diffing. Shared by the API and the engine. */
export const toNameKey = (name: string): string => name.normalize('NFC').toLowerCase();

/**
 * Lookup identity for a single variant. Note this deliberately drops the literal spelling of
 * `family` (via `toNameKey`) — the rendering identity is the raw document string (§2.1), and face
 * keys in `font-manager.ts` prefix it onto this key.
 */
export const canonicalVariantKey = (family: string, v: CustomFontVariant): string =>
  `${toNameKey(family)}|${v.weight}|${v.style}|${v.url}`;

// ---- module state ----

let families = new Map<string, CustomFontFamily>();
/** SINGLE gate: flips on the FIRST settle of the host query — success OR terminal error. */
let ready = false;
let readyWaiters: Array<() => void> = [];
const changeListeners = new Set<(c: RegistryChange) => void>();
let dataProvider: ((v: CustomFontVariant & { family: string }) => Promise<Uint8Array>) | null =
  null;

function becomeReady(): void {
  if (ready) return;
  ready = true;
  const waiters = readyWaiters;
  readyWaiters = [];
  for (const w of waiters) w();
}

function fire(change: RegistryChange): void {
  for (const listener of [...changeListeners]) listener(change);
}

function toMap(list: CustomFontFamily[]): Map<string, CustomFontFamily> {
  return new Map(list.map((f) => [toNameKey(f.name), f]));
}

function variantKeySet(fam: CustomFontFamily): Set<string> {
  return new Set(fam.variants.map((v) => canonicalVariantKey(fam.name, v)));
}

function diffRegistry(
  prev: Map<string, CustomFontFamily>,
  next: Map<string, CustomFontFamily>,
): RegistryChange {
  const removedVariantKeys: string[] = [];
  const changedFamilies = new Set<string>();

  for (const [key, prevFam] of prev) {
    const nextFam = next.get(key);
    const prevKeys = variantKeySet(prevFam);
    const nextKeys = nextFam ? variantKeySet(nextFam) : new Set<string>();
    let removedHere = false;
    for (const k of prevKeys) {
      if (!nextKeys.has(k)) {
        removedVariantKeys.push(k);
        removedHere = true;
      }
    }
    if (!nextFam) {
      changedFamilies.add(prevFam.name);
      continue;
    }
    if (removedHere || prevKeys.size !== nextKeys.size) changedFamilies.add(nextFam.name);
  }

  for (const [key, nextFam] of next) {
    if (!prev.has(key)) changedFamilies.add(nextFam.name);
  }

  return { removedVariantKeys, changedFamilies: [...changedFamilies] };
}

/**
 * TERMINAL-ERROR PATH ONLY. Never touches `families`, never diffs or evicts — a fetch error must
 * not shrink a populated registry.
 */
export function markCustomFontsReady(): void {
  if (ready) return;
  becomeReady();
  fire({ removedVariantKeys: [], changedFamilies: [] });
}

/** Successful payloads ONLY. An empty array means "no fonts exist", which legitimately evicts. */
export function registerCustomFonts(next: CustomFontFamily[]): void {
  const wasReady = ready;
  const nextMap = toMap(next);
  const change = diffRegistry(families, nextMap);
  families = nextMap;
  becomeReady();
  const noop = change.removedVariantKeys.length === 0 && change.changedFamilies.length === 0;
  // Identical-payload refetches (e.g. window-focus refetch) are silent.
  if (!wasReady || !noop) fire(change);
}

export function isCustomFontsReady(): boolean {
  return ready;
}

/**
 * Resolves when the registry settles. `timeoutMs` is a caller-local EXPORT escape hatch
 * (degrade, never hang) — it never changes registry state.
 */
export function whenCustomFontsReady(opts?: { timeoutMs?: number }): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeoutMs = opts?.timeoutMs;
    const timer: ReturnType<typeof setTimeout> | undefined =
      timeoutMs === undefined ? undefined : setTimeout(resolve, timeoutMs);
    readyWaiters.push(() => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    });
  });
}

export function onCustomFontsChange(listener: (c: RegistryChange) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Picker "Custom" group — excludes variant-less families. */
export function getCustomFontFamilies(): CustomFontFamily[] {
  return [...families.values()].filter((f) => f.variants.length > 0);
}

/** `null` => not a custom family. */
export function getCustomFontFamilyRecord(name: string): CustomFontFamily | null {
  return families.get(toNameKey(name)) ?? null;
}

/**
 * The `variants.length > 0` clause is load-bearing: a family whose last variant was deleted is
 * still a row. Without it, `loadCustomFamily`'s fast path passes vacuously and marks the family
 * loaded with zero faces, while the missing-font warning (gated on `!isCustomFontFamily`) is
 * suppressed — silent fallback rendering everywhere with no signal.
 */
export function isCustomFontFamily(name: string): boolean {
  const fam = families.get(toNameKey(name));
  return !!fam && fam.variants.length > 0;
}

/** `null` => not a custom family. */
export function getAvailableVariants(
  name: string,
): Array<{ weight: number; style: 'normal' | 'italic' }> | null {
  const fam = getCustomFontFamilyRecord(name);
  if (!fam) return null;
  return fam.variants.map((v) => ({ weight: v.weight, style: v.style }));
}

export function nearestAvailableVariant(
  name: string,
  weight: number,
  style: 'normal' | 'italic',
): { weight: number; style: 'normal' | 'italic' } {
  const variants = getCustomFontFamilyRecord(name)?.variants ?? [];
  if (variants.length === 0) return { weight, style };
  const sameStyle = variants.filter((v) => v.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : variants;
  let best = pool[0]!;
  for (const v of pool) {
    if (Math.abs(v.weight - weight) < Math.abs(best.weight - weight)) best = v;
  }
  return { weight: best.weight, style: best.style };
}

export function setCustomFontDataProvider(
  fn: (v: CustomFontVariant & { family: string }) => Promise<Uint8Array>,
): void {
  dataProvider = fn;
}

/**
 * Default provider is `fetch(v.url)`. No byte cache in v1: the browser HTTP cache handles repeats
 * on the web, and the API server's provider reads page-cached local disk.
 */
export function getCustomFontData(v: CustomFontVariant & { family: string }): Promise<Uint8Array> {
  if (dataProvider) return dataProvider(v);
  return fetch(v.url)
    .then((res) => {
      // Without this an error page's body would be base64-embedded as font data.
      if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${v.url}`);
      return res.arrayBuffer();
    })
    .then((buf) => new Uint8Array(buf));
}

/** `"Name"` with the banned character class stripped. Every CSS emission uses this. */
export function quoteCssFamily(name: string): string {
  return `"${name.replace(/[\u0000-\u001f\u007f"'\\<>;{},[\]]/g, '')}"`;
}

export function mapDtoToEngine(dtos: FontFamilyDto[]): CustomFontFamily[] {
  return dtos.map((f) => ({
    name: f.name,
    variants: f.variants.map((v) => ({
      weight: v.weight,
      style: v.style,
      url: v.fileUrl,
      format: v.format,
      fileSize: v.fileSize,
    })),
  }));
}

/**
 * The mime type and `format()` hint MUST derive from the ORIGINAL upload's format: hardcoding
 * woff2 makes browsers skip the source entirely for ttf/otf/woff uploads.
 */
const FONT_FORMATS: Record<string, { mime: string; hint: string }> = {
  ttf: { mime: 'font/ttf', hint: 'truetype' },
  otf: { mime: 'font/otf', hint: 'opentype' },
  woff: { mime: 'font/woff', hint: 'woff' },
  woff2: { mime: 'font/woff2', hint: 'woff2' },
};

const DEFAULT_MAX_EMBED_BYTES = 3 * 1024 * 1024;

/**
 * Strips the CSS comment terminator so an interpolated name cannot break out of a comment. The
 * whole `star+slash+` run is stripped, not one terminator at a time: `A`, two stars, two slashes,
 * `B` would otherwise collapse back into a live terminator. (`*` and `/` are not in the banned
 * character class of `fontFamilyNameSchema`, so family names really can contain them.)
 */
export function escapeCssComment(value: string): string {
  return value.replace(/\*+\/+/g, '');
}

export interface UsedCustomVariant {
  /** The literal document spelling — the rendering identity (§2.1). */
  family: string;
  variant: CustomFontVariant;
}

/**
 * Every custom `(family, weight, style)` a document actually uses, including `segments[]`
 * overrides, each resolved through `nearestAvailableVariant` so callers name what will really
 * render. Document order, deduplicated.
 */
export function collectUsedCustomVariants(shapes: Shape[]): UsedCustomVariant[] {
  const seen = new Set<string>();
  const used: UsedCustomVariant[] = [];

  const add = (family: string | undefined, weight: number, style: 'normal' | 'italic') => {
    if (!family || !isCustomFontFamily(family)) return;
    const near = nearestAvailableVariant(family, weight, style);
    const key = `${family}|${near.weight}|${near.style}`;
    if (seen.has(key)) return;
    const variant = getCustomFontFamilyRecord(family)?.variants.find(
      (v) => v.weight === near.weight && v.style === near.style,
    );
    if (!variant) return;
    seen.add(key);
    used.push({ family, variant });
  };

  for (const shape of shapes) {
    if (shape.type !== 'text') continue;
    const text = shape as TextShape;
    const baseWeight = text.fontWeight ?? 400;
    const baseStyle = text.fontStyle === 'italic' ? 'italic' : 'normal';
    add(text.fontFamily, baseWeight, baseStyle);
    for (const segment of text.segments ?? []) {
      const style = segment.fontStyle ?? baseStyle;
      add(
        segment.fontFamily ?? text.fontFamily,
        segment.fontWeight ?? baseWeight,
        style === 'italic' ? 'italic' : 'normal',
      );
    }
  }

  return used;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fontFaceRule(family: string, v: CustomFontVariant, src: string): string {
  return `@font-face { font-family: ${quoteCssFamily(family)}; font-weight: ${v.weight}; font-style: ${v.style}; src: ${src}; }`;
}

/**
 * `@font-face` rules for every custom variant a document uses, with the bytes inlined as data
 * URLs. Above `maxEmbedBytes` it degrades: to `assetBaseUrl`-prefixed `url()` sources when a base
 * URL is available, and otherwise (the MCP case) to one comment per family and NO rules — a
 * JSON-RPC response must never carry megabytes of base64.
 */
export async function buildEmbeddedFontCss(
  shapes: Shape[],
  opts?: { assetBaseUrl?: string; maxEmbedBytes?: number },
): Promise<string> {
  const used = collectUsedCustomVariants(shapes);
  if (used.length === 0) return '';

  const maxEmbedBytes = opts?.maxEmbedBytes ?? DEFAULT_MAX_EMBED_BYTES;
  const assetBaseUrl = opts?.assetBaseUrl;
  const formatOf = (v: CustomFontVariant) => FONT_FORMATS[v.format] ?? FONT_FORMATS['woff2']!;

  const overBudgetCss = (list: UsedCustomVariant[]): string => {
    if (assetBaseUrl) {
      return list
        .map(({ family, variant }) =>
          fontFaceRule(
            family,
            variant,
            `url("${assetBaseUrl}${variant.url}") format('${formatOf(variant).hint}')`,
          ),
        )
        .join('\n');
    }
    return [...new Set(list.map((f) => f.family))]
      .map(
        (name) =>
          `/* Custom font ${escapeCssComment(quoteCssFamily(name))} omitted: exceeds embed size limit — serve from <instance>/storage/fonts */`,
      )
      .join('\n');
  };

  // When every variant declares its size, decide the budget BEFORE fetching: neither degraded mode
  // uses the bytes, so reading a whole family off disk (MCP) or over the network (url mode) to then
  // discard it is pure waste. Falls back to fetch-then-measure when a size is missing.
  if (used.every((u) => u.variant.fileSize !== undefined)) {
    const declared = used.reduce((n, u) => n + (u.variant.fileSize ?? 0), 0);
    if (declared > maxEmbedBytes) return overBudgetCss(used);
  }

  const fetched: Array<UsedCustomVariant & { bytes: Uint8Array }> = [];
  let totalBytes = 0;
  for (const u of used) {
    try {
      const bytes = await getCustomFontData({ ...u.variant, family: u.family });
      totalBytes += bytes.byteLength;
      fetched.push({ ...u, bytes });
    } catch {
      // A missing or unreachable font file skips that variant; it never fails the export.
    }
  }
  if (fetched.length === 0) return '';

  if (totalBytes > maxEmbedBytes) return overBudgetCss(fetched);

  return fetched
    .map(({ family, variant, bytes }) => {
      const { mime, hint } = formatOf(variant);
      return fontFaceRule(
        family,
        variant,
        `url(data:${mime};base64,${toBase64(bytes)}) format('${hint}')`,
      );
    })
    .join('\n');
}

/** Test-only: reinitialize all module state. */
export function __resetCustomFontState(): void {
  families = new Map();
  ready = false;
  readyWaiters = [];
  changeListeners.clear();
  dataProvider = null;
}
