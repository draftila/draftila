// Per-test fakes for `FontFace`, `document.fonts` and Google-fonts `<link>` loading.
//
// The shared `tests/setup.ts` preload installs a linkedom document with NO `.fonts` and NO
// `FontFace` (it also serves `codegen-html.test.ts`), so it is deliberately left untouched; these
// fakes are installed and restored per test.

export interface FakeFace {
  family: string;
  source: string;
  weight: string;
  style: string;
  url: string;
  load(): Promise<FakeFace>;
}

interface PendingLink {
  href: string;
  ok: () => void;
  fail: () => void;
}

export interface FontFakes {
  /** Every FontFace constructed since install, in order. */
  constructed: FakeFace[];
  /** Faces currently present in `document.fonts`. */
  added: Set<FakeFace>;
  /** `<link href>` values appended to `document.head` since install. */
  linkHrefs: string[];
  /** Settle every pending `face.load()` whose url matches. */
  resolveLoad(url: string): void;
  rejectLoad(url: string): void;
  /** Fire `onload` (or `onerror`) on every `<link>` appended so far. */
  flushLinks(outcome?: 'load' | 'error'): void;
  restore(): void;
}

export function installFontFakes(): FontFakes {
  const constructed: FakeFace[] = [];
  const added = new Set<FakeFace>();
  const linkHrefs: string[] = [];
  const pendingFaces: Array<{ url: string; resolve: () => void; reject: () => void }> = [];
  const pendingLinks: PendingLink[] = [];

  class FakeFontFace implements FakeFace {
    family: string;
    source: string;
    weight: string;
    style: string;
    url: string;

    constructor(family: string, source: string, descriptors?: { weight?: string; style?: string }) {
      this.family = family;
      this.source = source;
      this.weight = descriptors?.weight ?? 'normal';
      this.style = descriptors?.style ?? 'normal';
      this.url = /url\("([^"]*)"\)/.exec(source)?.[1] ?? source;
      constructed.push(this);
    }

    load(): Promise<FakeFace> {
      return new Promise<FakeFace>((resolve, reject) => {
        pendingFaces.push({
          url: this.url,
          resolve: () => resolve(this),
          reject: () => reject(new Error(`failed: ${this.url}`)),
        });
      });
    }
  }

  const fontsStub = {
    add: (face: FakeFace) => {
      added.add(face);
    },
    delete: (face: FakeFace) => added.delete(face),
    check: () => false,
    ready: Promise.resolve(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const g = globalThis as unknown as Record<string, unknown>;
  const hadFontFace = 'FontFace' in g;
  const prevFontFace = g['FontFace'];
  g['FontFace'] = FakeFontFace;

  const doc = globalThis.document as unknown as Record<string, unknown>;
  const hadFonts = 'fonts' in doc;
  const prevFonts = doc['fonts'];
  doc['fonts'] = fontsStub;

  const head = globalThis.document.head as unknown as Record<string, unknown>;
  const hadOwnAppend = Object.prototype.hasOwnProperty.call(head, 'appendChild');
  const prevAppend = head['appendChild'] as (node: unknown) => unknown;
  head['appendChild'] = function fakeAppendChild(node: unknown): unknown {
    const el = node as {
      tagName?: string;
      href?: string;
      onload?: () => void;
      onerror?: () => void;
    };
    if (el.tagName?.toUpperCase() === 'LINK') {
      linkHrefs.push(el.href ?? '');
      pendingLinks.push({
        href: el.href ?? '',
        ok: () => el.onload?.(),
        fail: () => el.onerror?.(),
      });
      return node;
    }
    return prevAppend.call(globalThis.document.head, node);
  };

  const settleFaces = (url: string, kind: 'resolve' | 'reject') => {
    for (let i = pendingFaces.length - 1; i >= 0; i--) {
      const p = pendingFaces[i]!;
      if (p.url !== url) continue;
      pendingFaces.splice(i, 1);
      if (kind === 'resolve') p.resolve();
      else p.reject();
    }
  };

  return {
    constructed,
    added,
    linkHrefs,
    resolveLoad: (url) => settleFaces(url, 'resolve'),
    rejectLoad: (url) => settleFaces(url, 'reject'),
    flushLinks: (outcome = 'load') => {
      for (const l of pendingLinks.splice(0)) {
        if (outcome === 'load') l.ok();
        else l.fail();
      }
    },
    restore: () => {
      if (hadFontFace) g['FontFace'] = prevFontFace;
      else delete g['FontFace'];
      if (hadFonts) doc['fonts'] = prevFonts;
      else delete doc['fonts'];
      if (hadOwnAppend) head['appendChild'] = prevAppend;
      else delete head['appendChild'];
    },
  };
}

/** Lets pending microtask chains (`face.load().then(...)` → `Promise.all` → notify) drain. */
export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
