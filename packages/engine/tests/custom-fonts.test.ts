import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { Shape } from '@draftila/shared';
import {
  __resetCustomFontState,
  buildEmbeddedFontCss,
  canonicalVariantKey,
  escapeCssComment,
  setCustomFontDataProvider,
  getAvailableVariants,
  getCustomFontFamilies,
  isCustomFontFamily,
  isCustomFontsReady,
  markCustomFontsReady,
  nearestAvailableVariant,
  onCustomFontsChange,
  quoteCssFamily,
  registerCustomFonts,
  toNameKey,
  whenCustomFontsReady,
  type CustomFontFamily,
  type RegistryChange,
} from '../src/custom-fonts';
import {
  __resetFontManagerState,
  collectFontFamilies,
  ensureFontsLoaded,
  ensureFontsLoadedAsync,
  isFontLoaded,
  loadCustomFontPreview,
  onFontsLoaded,
  requiresCustomFontRegistry,
} from '../src/font-manager';
import { installFontFakes, flush, type FontFakes } from './font-fakes';
import { generateSvg } from '../src/interchange/svg/svg-generator';
import {
  createInterchangeDocument,
  createInterchangeNode,
} from '../src/interchange/interchange-format';

type VariantSpec = [number, 'normal' | 'italic', string];

function fam(name: string, variants: VariantSpec[]): CustomFontFamily {
  return {
    name,
    variants: variants.map(([weight, style, url]) => ({ weight, style, url, format: 'woff2' })),
  };
}

const DRAFTILA_SANS = fam('Draftila Sans', [
  [400, 'normal', '/storage/fonts/acme-400.woff2'],
  [700, 'normal', '/storage/fonts/acme-700.woff2'],
]);

let fakes: FontFakes;

beforeEach(() => {
  __resetFontManagerState();
  __resetCustomFontState();
  fakes = installFontFakes();
});

afterEach(() => {
  fakes.restore();
  __resetFontManagerState();
  __resetCustomFontState();
});

async function loadDraftilaSans(): Promise<void> {
  registerCustomFonts([DRAFTILA_SANS]);
  const p = ensureFontsLoadedAsync(['Draftila Sans']);
  fakes.resolveLoad('/storage/fonts/acme-400.woff2');
  fakes.resolveLoad('/storage/fonts/acme-700.woff2');
  await p;
}

describe('idempotence under repeated calls', () => {
  test('repeated loads construct zero extra faces and fire zero callbacks', async () => {
    await loadDraftilaSans();
    expect(fakes.constructed).toHaveLength(2);

    let notifies = 0;
    onFontsLoaded(() => {
      notifies++;
    });

    await ensureFontsLoadedAsync(['Draftila Sans']);
    await ensureFontsLoadedAsync(['Draftila Sans']);
    for (let i = 0; i < 100; i++) ensureFontsLoaded(['Draftila Sans']);
    await flush();

    expect(fakes.constructed).toHaveLength(2);
    expect(notifies).toBe(0);
  });

  test('a rejecting face is loaded exactly once across 100 calls', async () => {
    registerCustomFonts([fam('Bad', [[400, 'normal', '/storage/fonts/bad.woff2']])]);
    ensureFontsLoaded(['Bad']);
    expect(fakes.constructed).toHaveLength(1);

    fakes.rejectLoad('/storage/fonts/bad.woff2');
    await flush();
    expect(fakes.added.size).toBe(0);

    for (let i = 0; i < 100; i++) ensureFontsLoaded(['Bad']);
    await flush();
    expect(fakes.constructed).toHaveLength(1);
  });

  test('a registry change touching a failed family creates exactly one retry face', async () => {
    registerCustomFonts([fam('Bad', [[400, 'normal', '/storage/fonts/bad.woff2']])]);
    ensureFontsLoaded(['Bad']);
    fakes.rejectLoad('/storage/fonts/bad.woff2');
    await flush();
    expect(fakes.constructed).toHaveLength(1);

    // Same variant, re-uploaded under a new url.
    registerCustomFonts([fam('Bad', [[400, 'normal', '/storage/fonts/bad-v2.woff2']])]);
    ensureFontsLoaded(['Bad']);
    await flush();

    expect(fakes.constructed).toHaveLength(2);
    expect(fakes.constructed[1]!.url).toBe('/storage/fonts/bad-v2.woff2');
  });
});

describe('deferred replay drains on every ready transition', () => {
  test('data path: a name deferred pre-ready loads after registerCustomFonts', () => {
    ensureFontsLoaded(['Draftila Sans']);
    expect(fakes.constructed).toHaveLength(0);
    expect(fakes.linkHrefs).toHaveLength(0);

    registerCustomFonts([DRAFTILA_SANS]);

    expect(fakes.constructed).toHaveLength(2);
    expect(fakes.linkHrefs).toHaveLength(0);
  });

  test('error path: a name deferred pre-ready replays after markCustomFontsReady', () => {
    ensureFontsLoaded(['Ghost']);
    expect(fakes.linkHrefs).toHaveLength(0);

    markCustomFontsReady();

    expect(fakes.linkHrefs).toHaveLength(1);
    expect(fakes.linkHrefs[0]).toContain('Ghost');
  });

  test('curated Google names are never deferred', () => {
    ensureFontsLoaded(['Roboto']);
    expect(fakes.linkHrefs).toHaveLength(1);
  });
});

describe('terminal Google failure is remembered and correctly scoped', () => {
  test('ensureFontsLoadedAsync settles after a link failure and memoizes the name', async () => {
    markCustomFontsReady();

    const p = ensureFontsLoadedAsync(['AcmeBrand']);
    expect(fakes.linkHrefs).toHaveLength(1);
    fakes.flushLinks('error');
    await p; // must not hang

    ensureFontsLoaded(['AcmeBrand']);
    ensureFontsLoaded(['AcmeBrand']);
    expect(fakes.linkHrefs).toHaveLength(1);
  });

  test('a poisoned batch leaves the curated name retryable', async () => {
    markCustomFontsReady();

    ensureFontsLoaded(['AcmeBrand', 'Roboto']);
    expect(fakes.linkHrefs).toHaveLength(1);
    fakes.flushLinks('error');
    await flush();

    ensureFontsLoaded(['Roboto']);
    expect(fakes.linkHrefs).toHaveLength(2);

    ensureFontsLoaded(['AcmeBrand']);
    expect(fakes.linkHrefs).toHaveLength(2);
  });

  test('a family that becomes custom stops being a dead Google name', async () => {
    markCustomFontsReady();
    ensureFontsLoaded(['AcmeBrand']);
    fakes.flushLinks('error');
    await flush();

    registerCustomFonts([fam('AcmeBrand', [[400, 'normal', '/storage/fonts/ab-400.woff2']])]);
    ensureFontsLoaded(['AcmeBrand']);

    expect(fakes.constructed).toHaveLength(1);
    expect(fakes.linkHrefs).toHaveLength(1);
  });
});

describe('eviction on delete', () => {
  test('registry removal deletes the FontFace from document.fonts', async () => {
    await loadDraftilaSans();
    expect(fakes.added.size).toBe(2);

    registerCustomFonts([]);

    expect(fakes.added.size).toBe(0);
    expect(isFontLoaded('Draftila Sans')).toBe(false);
  });

  test('eviction mid-load never marks the key loaded, and re-register loads a fresh face', async () => {
    registerCustomFonts([fam('Draftila Sans', [[400, 'normal', '/storage/fonts/acme-400.woff2']])]);
    ensureFontsLoaded(['Draftila Sans']);
    expect(fakes.constructed).toHaveLength(1);

    registerCustomFonts([]); // evict mid-load
    fakes.resolveLoad('/storage/fonts/acme-400.woff2');
    await flush();
    expect(fakes.added.size).toBe(0);

    registerCustomFonts([fam('Draftila Sans', [[400, 'normal', '/storage/fonts/acme-400.woff2']])]);
    ensureFontsLoaded(['Draftila Sans']);
    expect(fakes.constructed).toHaveLength(2);

    fakes.resolveLoad('/storage/fonts/acme-400.woff2');
    await flush();
    expect(fakes.added.size).toBe(1);
    expect(isFontLoaded('Draftila Sans')).toBe(true);
  });
});

describe('registry diffing and readiness', () => {
  test('identical-payload re-register fires zero listeners', () => {
    registerCustomFonts([DRAFTILA_SANS]);
    const changes: RegistryChange[] = [];
    onCustomFontsChange((c) => changes.push(c));

    registerCustomFonts([DRAFTILA_SANS]);
    registerCustomFonts([
      fam('Draftila Sans', [
        ...DRAFTILA_SANS.variants.map((v) => [v.weight, v.style, v.url] as VariantSpec),
      ]),
    ]);

    expect(changes).toHaveLength(0);
  });

  test('diff reports removed variant keys and changed families', () => {
    registerCustomFonts([
      DRAFTILA_SANS,
      fam('Other', [[400, 'normal', '/storage/fonts/other.woff2']]),
    ]);
    const changes: RegistryChange[] = [];
    onCustomFontsChange((c) => changes.push(c));

    registerCustomFonts([fam('Draftila Sans', [[400, 'normal', '/storage/fonts/acme-400.woff2']])]);

    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.changedFamilies.sort()).toEqual(['Draftila Sans', 'Other']);
    expect(c.removedVariantKeys.sort()).toEqual(
      [
        canonicalVariantKey('Draftila Sans', DRAFTILA_SANS.variants[1]!),
        canonicalVariantKey('Other', {
          weight: 400,
          style: 'normal',
          url: '/storage/fonts/other.woff2',
          format: 'woff2',
        }),
      ].sort(),
    );
  });

  test('the first successful register fires even when the payload is empty', () => {
    const changes: RegistryChange[] = [];
    onCustomFontsChange((c) => changes.push(c));

    registerCustomFonts([]);

    expect(changes).toHaveLength(1);
    expect(isCustomFontsReady()).toBe(true);
  });

  test('whenCustomFontsReady resolves on both settle paths', async () => {
    let dataResolved = false;
    void whenCustomFontsReady().then(() => {
      dataResolved = true;
    });
    registerCustomFonts([DRAFTILA_SANS]);
    await flush();
    expect(dataResolved).toBe(true);

    __resetFontManagerState();
    __resetCustomFontState();

    let errorResolved = false;
    void whenCustomFontsReady().then(() => {
      errorResolved = true;
    });
    markCustomFontsReady();
    await flush();
    expect(errorResolved).toBe(true);
  });

  test('whenCustomFontsReady degrades on timeout without changing state', async () => {
    await whenCustomFontsReady({ timeoutMs: 1 });
    expect(isCustomFontsReady()).toBe(false);
  });

  test('markCustomFontsReady on a populated ready registry is a total no-op', () => {
    registerCustomFonts([DRAFTILA_SANS]);
    const changes: RegistryChange[] = [];
    onCustomFontsChange((c) => changes.push(c));

    markCustomFontsReady();

    expect(changes).toHaveLength(0);
    expect(getCustomFontFamilies()).toHaveLength(1);
    expect(isCustomFontFamily('Draftila Sans')).toBe(true);
  });
});

describe('rendering identity', () => {
  test('an NFD spelling gets its own face, and removal evicts every spelling', async () => {
    const nfc = 'Caf\u00e9';
    const nfd = 'Cafe\u0301';
    expect(nfc).not.toBe(nfd);
    expect(toNameKey(nfd)).toBe(toNameKey(nfc));

    registerCustomFonts([fam(nfc, [[400, 'normal', '/storage/fonts/cafe-400.woff2']])]);
    ensureFontsLoaded([nfc, nfd]);

    expect(fakes.constructed).toHaveLength(2);
    expect(fakes.constructed.map((f) => f.family).sort()).toEqual([nfc, nfd].sort());

    fakes.resolveLoad('/storage/fonts/cafe-400.woff2');
    await flush();
    expect(fakes.added.size).toBe(2);

    registerCustomFonts([]);
    expect(fakes.added.size).toBe(0);
  });

  test('the face carries the raw spelling and the declared weight/style', () => {
    registerCustomFonts([
      fam('Draftila Sans', [[700, 'italic', '/storage/fonts/acme-700i.woff2']]),
    ]);
    ensureFontsLoaded(['Draftila Sans']);

    const face = fakes.constructed[0]!;
    expect(face.family).toBe('Draftila Sans');
    expect(face.weight).toBe('700');
    expect(face.style).toBe('italic');
    expect(face.source).toBe('url("/storage/fonts/acme-700i.woff2")');
  });
});

describe('variant availability', () => {
  const VARIED = fam('Varied', [
    [300, 'normal', '/storage/fonts/v-300.woff2'],
    [700, 'normal', '/storage/fonts/v-700.woff2'],
    [400, 'italic', '/storage/fonts/v-400i.woff2'],
  ]);

  test('getAvailableVariants returns null for non-custom names', () => {
    registerCustomFonts([VARIED]);
    expect(getAvailableVariants('Roboto')).toBeNull();
    expect(getAvailableVariants('Varied')).toEqual([
      { weight: 300, style: 'normal' },
      { weight: 700, style: 'normal' },
      { weight: 400, style: 'italic' },
    ]);
  });

  test('nearestAvailableVariant: exact, same-style nearest, cross-style fallback', () => {
    registerCustomFonts([VARIED]);
    expect(nearestAvailableVariant('Varied', 700, 'normal')).toEqual({
      weight: 700,
      style: 'normal',
    });
    expect(nearestAvailableVariant('Varied', 400, 'normal')).toEqual({
      weight: 300,
      style: 'normal',
    });
    expect(nearestAvailableVariant('Varied', 900, 'italic')).toEqual({
      weight: 400,
      style: 'italic',
    });

    registerCustomFonts([fam('OnlyItalic', [[400, 'italic', '/storage/fonts/oi.woff2']])]);
    expect(nearestAvailableVariant('OnlyItalic', 700, 'normal')).toEqual({
      weight: 400,
      style: 'italic',
    });
  });

  test('loadCustomFontPreview starts exactly one load, for the nearest to 400/normal', () => {
    registerCustomFonts([VARIED]);
    loadCustomFontPreview('Varied');

    expect(fakes.constructed).toHaveLength(1);
    expect(fakes.constructed[0]!.weight).toBe('300');
    expect(fakes.constructed[0]!.style).toBe('normal');

    loadCustomFontPreview('Varied');
    expect(fakes.constructed).toHaveLength(1);
  });
});

describe('variant-less families', () => {
  test('are not custom, absent from the picker, and never marked loaded', () => {
    registerCustomFonts([{ name: 'Empty', variants: [] }]);

    expect(isCustomFontFamily('Empty')).toBe(false);
    expect(getCustomFontFamilies()).toHaveLength(0);

    ensureFontsLoaded(['Empty']);
    expect(fakes.constructed).toHaveLength(0);
    expect(isFontLoaded('Empty')).toBe(false);
  });
});

describe('environment guards', () => {
  test('no FontFace: custom families no-op but still count as loaded', () => {
    fakes.restore();
    registerCustomFonts([DRAFTILA_SANS]);

    expect(() => ensureFontsLoaded(['Draftila Sans'])).not.toThrow();
    expect(isFontLoaded('Draftila Sans')).toBe(true);
  });
});

describe('helpers', () => {
  test('collectFontFamilies includes segment-level overrides', () => {
    const shapes = [
      { type: 'text', fontFamily: 'Draftila Sans', segments: [{ fontFamily: 'Other' }, {}] },
      { type: 'rect', fontFamily: 'Ignored' },
      { type: 'text', fontFamily: 'Draftila Sans' },
    ];
    expect(collectFontFamilies(shapes).sort()).toEqual(['Draftila Sans', 'Other']);
  });

  test('requiresCustomFontRegistry ignores generic and curated names', () => {
    expect(requiresCustomFontRegistry(['sans-serif', 'Roboto'])).toBe(false);
    expect(requiresCustomFontRegistry(['sans-serif', 'Draftila Sans'])).toBe(true);
  });

  test('quoteCssFamily quotes and strips banned characters', () => {
    expect(quoteCssFamily('Acme Sans')).toBe('"Acme Sans"');
    expect(quoteCssFamily('Ac"me\\;{}[]<>,')).toBe('"Acme"');
  });

  test('escapeCssComment cannot re-create the terminator it strips', () => {
    // `*` and `/` are not banned by `fontFamilyNameSchema`, so these are real family names.
    expect(escapeCssComment('A**//B')).toBe('AB');
    expect(escapeCssComment('A*/B')).toBe('AB');
    expect(escapeCssComment('A*/*/B')).toBe('AB');
    expect(escapeCssComment('A/*B')).toBe('A/*B');
    expect(escapeCssComment('Acme Sans')).toBe('Acme Sans');
  });

  test('canonicalVariantKey is spelling-insensitive', () => {
    const v = { weight: 400, style: 'normal' as const, url: '/u.woff2', format: 'woff2' };
    expect(canonicalVariantKey('Café', v)).toBe(canonicalVariantKey('CAFÉ', v));
  });
});

describe('buildEmbeddedFontCss', () => {
  function textShape(over: Partial<Shape> & Record<string, unknown> = {}): Shape {
    return {
      id: 'text-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 24,
      rotation: 0,
      parentId: null,
      opacity: 1,
      locked: false,
      visible: true,
      name: 'Heading',
      blendMode: 'normal',
      content: 'Hello',
      textAutoResize: 'none',
      fontSize: 16,
      fontFamily: 'Draftila Sans',
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      letterSpacing: 0,
      textDecoration: 'none',
      textTransform: 'none',
      textTruncation: 'none',
      fills: [{ color: '#111111', opacity: 1, visible: true }],
      shadows: [],
      blurs: [],
      ...over,
    } as Shape;
  }

  /** In-memory provider: `n` bytes of 0x41 per variant, no network and no DOM. */
  function provideBytes(bytesPerVariant = 4): string[] {
    const requested: string[] = [];
    setCustomFontDataProvider((v) => {
      requested.push(v.url);
      return Promise.resolve(new Uint8Array(bytesPerVariant).fill(0x41));
    });
    return requested;
  }

  test('emits one rule per used variant, with base64 bytes', async () => {
    registerCustomFonts([DRAFTILA_SANS]);
    const requested = provideBytes();

    const css = await buildEmbeddedFontCss([
      textShape(),
      textShape({ id: 'text-2', fontWeight: 700 }),
      textShape({ id: 'text-3', fontWeight: 400 }),
    ]);

    const rules = css.split('\n');
    expect(rules).toHaveLength(2);
    expect(requested).toEqual(['/storage/fonts/acme-400.woff2', '/storage/fonts/acme-700.woff2']);
    expect(rules[0]).toBe(
      `@font-face { font-family: "Draftila Sans"; font-weight: 400; font-style: normal; src: url(data:font/woff2;base64,${btoa('AAAA')}) format('woff2'); }`,
    );
    expect(rules[1]).toContain('font-weight: 700');
  });

  test('returns empty string when no custom family is used', async () => {
    registerCustomFonts([DRAFTILA_SANS]);
    provideBytes();
    expect(await buildEmbeddedFontCss([textShape({ fontFamily: 'Roboto' })])).toBe('');
    expect(await buildEmbeddedFontCss([])).toBe('');
  });

  test('unavailable pairs resolve to the nearest variant that will actually render', async () => {
    registerCustomFonts([DRAFTILA_SANS]);
    provideBytes();

    // 500 normal and 900 italic both fall back onto real files, and 500 dedupes against 400.
    const css = await buildEmbeddedFontCss([
      textShape({ fontWeight: 500 }),
      textShape({ id: 'text-2', fontWeight: 900, fontStyle: 'italic' }),
    ]);

    const rules = css.split('\n');
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('font-weight: 400');
    expect(rules[1]).toContain('font-weight: 700');
    expect(css).not.toContain('font-style: italic');
  });

  test('includes segment-level family, weight and style overrides', async () => {
    registerCustomFonts([
      DRAFTILA_SANS,
      fam('Draftila Serif', [[400, 'italic', '/storage/fonts/serif-400i.woff2']]),
    ]);
    const requested = provideBytes();

    const css = await buildEmbeddedFontCss([
      textShape({
        fontFamily: 'Roboto',
        segments: [
          { text: 'a', fontFamily: 'Draftila Sans', fontWeight: 700 },
          { text: 'b', fontFamily: 'Draftila Serif', fontStyle: 'italic' },
        ],
      }),
    ]);

    expect(requested).toEqual(['/storage/fonts/acme-700.woff2', '/storage/fonts/serif-400i.woff2']);
    expect(css).toContain('font-family: "Draftila Sans"; font-weight: 700');
    expect(css).toContain('font-family: "Draftila Serif"; font-weight: 400; font-style: italic');
  });

  test('mime and format() hint derive from the original upload format', async () => {
    registerCustomFonts([
      {
        name: 'Mixed',
        variants: [
          { weight: 400, style: 'normal', url: '/storage/fonts/m-400.ttf', format: 'ttf' },
          { weight: 700, style: 'normal', url: '/storage/fonts/m-700.otf', format: 'otf' },
          { weight: 900, style: 'normal', url: '/storage/fonts/m-900.woff', format: 'woff' },
        ],
      },
    ]);
    provideBytes();

    const css = await buildEmbeddedFontCss([
      textShape({ fontFamily: 'Mixed', fontWeight: 400 }),
      textShape({ id: 'b', fontFamily: 'Mixed', fontWeight: 700 }),
      textShape({ id: 'c', fontFamily: 'Mixed', fontWeight: 900 }),
    ]);

    expect(css).toContain(`src: url(data:font/ttf;base64,${btoa('AAAA')}) format('truetype')`);
    expect(css).toContain('data:font/otf;base64,');
    expect(css).toContain("format('opentype')");
    expect(css).toContain('data:font/woff;base64,');
    expect(css).toContain("format('woff')");
  });

  test('above maxEmbedBytes with assetBaseUrl it switches to absolute url() sources', async () => {
    registerCustomFonts([DRAFTILA_SANS]);
    provideBytes(1024);

    const css = await buildEmbeddedFontCss(
      [textShape(), textShape({ id: 'text-2', fontWeight: 700 })],
      { assetBaseUrl: 'https://draftila.test', maxEmbedBytes: 2047 },
    );

    expect(css).not.toContain('base64');
    expect(css).toContain(
      `src: url("https://draftila.test/storage/fonts/acme-400.woff2") format('woff2')`,
    );
    expect(css).toContain(
      `src: url("https://draftila.test/storage/fonts/acme-700.woff2") format('woff2')`,
    );
  });

  test('above maxEmbedBytes without assetBaseUrl it degrades to one comment per family', async () => {
    registerCustomFonts([
      DRAFTILA_SANS,
      fam('Draftila Serif', [[400, 'normal', '/storage/fonts/serif-400.woff2']]),
    ]);
    provideBytes(1024);

    const css = await buildEmbeddedFontCss(
      [
        textShape(),
        textShape({ id: 'text-2', fontWeight: 700 }),
        textShape({ id: 'text-3', fontFamily: 'Draftila Serif' }),
      ],
      { maxEmbedBytes: 2047 },
    );

    expect(css).not.toContain('@font-face');
    expect(css).not.toContain('base64');
    expect(css.split('\n')).toEqual([
      '/* Custom font "Draftila Sans" omitted: exceeds embed size limit — serve from <instance>/storage/fonts */',
      '/* Custom font "Draftila Serif" omitted: exceeds embed size limit — serve from <instance>/storage/fonts */',
    ]);
  });

  test('a variant whose bytes cannot be fetched is skipped, never fatal', async () => {
    registerCustomFonts([DRAFTILA_SANS]);
    setCustomFontDataProvider((v) =>
      v.weight === 700 ? Promise.reject(new Error('404')) : Promise.resolve(new Uint8Array([0x41])),
    );

    const css = await buildEmbeddedFontCss([
      textShape(),
      textShape({ id: 'text-2', fontWeight: 700 }),
    ]);

    expect(css.split('\n')).toHaveLength(1);
    expect(css).toContain('font-weight: 400');
  });
});

describe('generateSvg fontFaceCss', () => {
  const doc = createInterchangeDocument(
    [createInterchangeNode('rectangle', { x: 0, y: 0, width: 10, height: 10 })],
    { source: 'test' },
  );

  test('emits the css inside a CDATA style element in defs', () => {
    const svg = generateSvg(doc, '', { fontFaceCss: '@font-face { font-family: "A"; }' });
    expect(svg).toContain(
      '<defs><style type="text/css"><![CDATA[@font-face { font-family: "A"; }]]></style>',
    );
  });

  test('is byte-identical to the unembedded output when no fontFaceCss is passed', () => {
    const baseline = generateSvg(doc);
    expect(generateSvg(doc, '', undefined)).toBe(baseline);
    expect(generateSvg(doc, '', {})).toBe(baseline);
    expect(generateSvg(doc, '', { fontFaceCss: '' })).toBe(baseline);
    expect(baseline).not.toContain('<style');
  });
});
