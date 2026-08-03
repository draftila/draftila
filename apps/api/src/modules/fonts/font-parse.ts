import { GlobalFonts } from '@napi-rs/canvas';
import type { FontFormat, FontStyle } from '@draftila/shared';
import * as fontkit from 'fontkit';
import { ValidationError } from '../../common/errors';
import { nanoid } from '../../common/lib/utils';

export interface ParsedFont {
  format: FontFormat;
  familyName: string;
  postscriptName: string | null;
  weight: number;
  style: FontStyle;
  warnings: string[];
}

/** Declared sfnt size after decompression, checked before fontkit inflates anything. */
const MAX_SFNT_SIZE = 100 * 1024 * 1024;
const MAX_TABLES = 128;

function fail(message: string): never {
  throw new ValidationError({ file: [message] });
}

/** Format comes from the magic bytes only — extension and MIME type are ignored. */
function sniffFormat(view: DataView): FontFormat | null {
  if (view.byteLength < 20) return null;
  switch (view.getUint32(0)) {
    case 0x00010000:
    case 0x74727565: // 'true'
      return 'ttf';
    case 0x4f54544f: // 'OTTO'
      return 'otf';
    case 0x774f4646: // 'wOFF'
      return 'woff';
    case 0x774f4632: // 'wOF2'
      return 'woff2';
    default:
      return null;
  }
}

function u8(view: DataView, pos: number): number {
  if (pos < 0 || pos >= view.byteLength) fail('Font table directory is truncated');
  return view.getUint8(pos);
}

function u32(view: DataView, pos: number): number {
  if (pos < 0 || pos + 4 > view.byteLength) fail('Font table directory is truncated');
  return view.getUint32(pos);
}

/** WOFF2 UIntBase128: up to five continuation-flagged bytes carrying seven bits each. */
function readBase128(view: DataView, pos: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = u8(view, pos + i);
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: pos + i + 1 };
  }
  return fail('Font table directory is malformed');
}

/**
 * Sums the per-table sizes fontkit will actually allocate. The header's `totalSfntSize` is never
 * consulted by fontkit — `WOFFFont._getTableStream` allocates `length` bytes per directory entry
 * and `WOFF2Font._decompress` sums `transformLength ?? length` — so the directory is the value
 * that has to be capped.
 */
function sumDeclaredTableSizes(
  view: DataView,
  format: 'woff' | 'woff2',
  numTables: number,
): number {
  let total = 0;

  const add = (size: number) => {
    total += size;
    if (size > MAX_SFNT_SIZE || total > MAX_SFNT_SIZE) {
      fail('Font too large after decompression');
    }
  };

  if (format === 'woff') {
    // WOFF1: fixed 20-byte entries after the 44-byte header; `origLength` sits at entry offset 12.
    for (let i = 0; i < numTables; i++) {
      add(u32(view, 44 + i * 20 + 12));
    }
    return total;
  }

  // WOFF2: variable-length entries after the 48-byte header.
  let pos = 48;
  for (let i = 0; i < numTables; i++) {
    const flags = u8(view, pos);
    pos += 1;
    const tagIndex = flags & 0x3f;
    // Only the glyf/loca known-tag indices change how `transformed` is derived, so the full
    // 63-entry known-tag table is not needed here.
    const isGlyfOrLoca = tagIndex === 10 || tagIndex === 11;
    if (tagIndex === 0x3f) pos += 4; // custom 4-byte tag
    const length = readBase128(view, pos);
    pos = length.next;
    const transformVersion = (flags >>> 6) & 0x03;
    const transformed = isGlyfOrLoca ? transformVersion === 0 : transformVersion !== 0;
    if (transformed) {
      const transformLength = readBase128(view, pos);
      pos = transformLength.next;
      add(transformLength.value);
    } else {
      add(length.value);
    }
  }
  return total;
}

/**
 * WOFF1 and WOFF2 headers both carry `numTables` (uint16 at offset 12) and `totalSfntSize`
 * (uint32 at offset 16). Those are the cheap first pass; the table directory is then walked
 * because it, not the header, is what fontkit sizes its allocations from.
 */
function checkDecompressionBomb(view: DataView, format: 'woff' | 'woff2'): void {
  const numTables = view.getUint16(12);
  if (numTables > MAX_TABLES) {
    fail('Font declares too many tables');
  }
  if (view.getUint32(16) > MAX_SFNT_SIZE) {
    fail('Font too large after decompression');
  }
  sumDeclaredTableSizes(view, format, numTables);
}

function snapWeight(usWeightClass: number): number {
  const snapped = Math.round(usWeightClass / 100) * 100;
  return Math.min(900, Math.max(100, snapped));
}

/**
 * fontkit decodes lazily, so `create` succeeding proves nothing: every table access below can throw
 * on an absent or corrupt table (`italicAngle` dereferences `post`, for one). §1.3 step 4 requires
 * any throw to become a 400, so the whole extraction lives inside the caller's try/catch.
 */
function readMetadata(bytes: Buffer): Omit<ParsedFont, 'format'> {
  const font = fontkit.create(bytes);

  // Font collections are already excluded by the magic-byte sniff.
  if (!('familyName' in font)) {
    fail('Could not parse font file');
  }

  if (Object.keys(font.variationAxes).length > 0) {
    fail(
      'Variable fonts are not supported yet — please upload static instances (one file per weight/style)',
    );
  }

  const os2 = font['OS/2'];
  if (!os2) {
    fail('Font has no OS/2 table — re-export it as a modern TTF/OTF');
  }

  const weight = snapWeight(os2.usWeightClass);
  const macStyleItalic =
    (font as unknown as { head?: { macStyle?: { italic?: boolean } } }).head?.macStyle?.italic ===
    true;
  const italicSource = os2.fsSelection.italic
    ? 'OS/2 fsSelection'
    : macStyleItalic
      ? 'head macStyle'
      : font.italicAngle !== 0
        ? 'italicAngle'
        : null;

  const warnings = [`Weight inferred as ${weight} from OS/2 usWeightClass ${os2.usWeightClass}`];
  if (italicSource) {
    warnings.push(`Style inferred as italic from ${italicSource}`);
  }

  // Renderability guard: skia has to accept the bytes too, or server-side PNG export would
  // silently fall back. A throwaway alias keeps concurrent exports undisturbed.
  const key = GlobalFonts.register(bytes, `__upload_check_${nanoid()}`);
  if (!key) {
    fail('Font not renderable server-side');
  }
  GlobalFonts.remove(key);

  return {
    familyName: font.familyName,
    postscriptName: font.postscriptName || null,
    weight,
    style: italicSource ? 'italic' : 'normal',
    warnings,
  };
}

export function parseFont(bytes: Buffer): ParsedFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const format = sniffFormat(view);
  if (!format) {
    fail('Unsupported font format — upload a TTF, OTF, WOFF or WOFF2 file');
  }

  if (format === 'woff' || format === 'woff2') {
    checkDecompressionBomb(view, format);
  }

  try {
    return { format, ...readMetadata(bytes) };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    return fail('Could not parse font file');
  }
}
