// Registry of admin-uploaded custom font families.
//
// IMPORT DISCIPLINE: this module is a LEAF. It imports only types from `@draftila/shared`.
// It must NEVER import `font-manager.ts` (which imports this module) — a cross-import would make
// module-evaluation order bundler-dependent and can crash at boot with a TDZ `ReferenceError`.

import type { FontFamilyDto, Shape } from '@draftila/shared';

export interface CustomFontVariant {
  weight: number;
  style: 'normal' | 'italic';
  url: string;
  format: string;
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
    .then((res) => res.arrayBuffer())
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
    })),
  }));
}

export function buildEmbeddedFontCss(
  _shapes: Shape[],
  _opts?: { assetBaseUrl?: string; maxEmbedBytes?: number },
): Promise<string> {
  // implemented in PR 3
  return Promise.resolve('');
}

/** Test-only: reinitialize all module state. */
export function __resetCustomFontState(): void {
  families = new Map();
  ready = false;
  readyWaiters = [];
  changeListeners.clear();
  dataProvider = null;
}
