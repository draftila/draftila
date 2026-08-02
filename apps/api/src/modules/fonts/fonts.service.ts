import { ALL_FONTS } from '@draftila/engine';
import { ConflictError } from '../../common/errors';
import { extractStorageKey, generateStorageKey, getStorage } from '../../common/lib/storage';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';
import type { ParsedFont } from './font-parse';

// moves to @draftila/engine in PR 2
export const toNameKey = (name: string) => name.normalize('NFC').toLowerCase();

const GOOGLE_FONT_NAME_KEYS = new Set(ALL_FONTS.map((f) => toNameKey(f.family)));

const familySelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  variants: {
    select: {
      id: true,
      familyId: true,
      weight: true,
      style: true,
      format: true,
      fileUrl: true,
      fileSize: true,
      postscriptName: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { weight: 'asc' },
  },
} as const;

export function listFamilies() {
  return db.fontFamily.findMany({ select: familySelect, orderBy: { name: 'asc' } });
}

export function getFamilyByNameKey(name: string) {
  return db.fontFamily.findUnique({ where: { nameKey: toNameKey(name) }, select: familySelect });
}

const duplicateVariantMessage = (parsed: ParsedFont) =>
  `This family already has a ${parsed.weight} ${parsed.style} variant. If your files genuinely differ, their internal OS/2 metadata is wrong or duplicated — fix it in font tooling (fontTools, Glyphs) and re-upload.`;

/**
 * The family lookup and duplicate pre-check are read-then-write, so two simultaneous uploads can
 * still collide on a unique index inside the transaction. Prisma reports that as P2002; surface it
 * as the 409 the pre-checks would have produced instead of letting it escape as a 500. Duck-typed
 * on `code` because sqlite and postgresql use separately generated clients.
 */
function asConflict(err: unknown, name: string, parsed: ParsedFont): ConflictError | null {
  const known = err as { code?: unknown; meta?: { target?: unknown } } | null;
  if (known?.code !== 'P2002') return null;
  const target = String(known.meta?.target ?? '');
  if (target.includes('weight') || target.includes('style')) {
    return new ConflictError(duplicateVariantMessage(parsed));
  }
  return new ConflictError(`"${name}" was just created by another upload — retry this file.`);
}

/**
 * Creates-or-finds the family by name key and adds one variant to it. Weight and style come from
 * the font's own tables, so a `(familyId, weight, style)` clash means the uploaded files carry
 * wrong or duplicated internal metadata.
 */
export async function createVariant(params: { name: string; parsed: ParsedFont; bytes: Buffer }) {
  const { name, parsed, bytes } = params;
  const nameKey = toNameKey(name);
  const family = await db.fontFamily.findUnique({ where: { nameKey }, select: { id: true } });

  if (!family && GOOGLE_FONT_NAME_KEYS.has(nameKey)) {
    throw new ConflictError(
      `"${name}" is already available as a built-in Google font — choose a different family name.`,
    );
  }

  if (family) {
    const duplicate = await db.fontVariant.findFirst({
      where: { familyId: family.id, weight: parsed.weight, style: parsed.style },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(duplicateVariantMessage(parsed));
    }
  }

  const key = generateStorageKey('fonts', parsed.format);
  const fileUrl = await getStorage().put(key, bytes);

  try {
    await db.$transaction(async (tx) => {
      const familyId = family?.id ?? nanoid();
      if (family) {
        // Explicit bump: this timestamp is the server-side registration cache token.
        await tx.fontFamily.update({ where: { id: familyId }, data: { updatedAt: new Date() } });
      } else {
        await tx.fontFamily.create({ data: { id: familyId, name, nameKey } });
      }
      await tx.fontVariant.create({
        data: {
          id: nanoid(),
          familyId,
          weight: parsed.weight,
          style: parsed.style,
          format: parsed.format,
          fileUrl,
          fileSize: bytes.byteLength,
          postscriptName: parsed.postscriptName,
        },
      });
    });
  } catch (err) {
    await getStorage()
      .delete(key)
      .catch(() => {});
    throw asConflict(err, name, parsed) ?? err;
  }

  const created = await getFamilyByNameKey(name);
  if (!created) throw new Error('Failed to create font family');
  return created;
}

export async function removeFamily(familyId: string) {
  const existing = await db.fontFamily.findUnique({
    where: { id: familyId },
    select: { id: true, variants: { select: { fileUrl: true } } },
  });
  if (!existing) return null;

  const storage = getStorage();
  for (const variant of existing.variants) {
    await storage.delete(extractStorageKey(variant.fileUrl)).catch(() => {});
  }

  await db.fontFamily.delete({ where: { id: familyId } });
  return existing;
}

export async function removeVariant(familyId: string, variantId: string) {
  const existing = await db.fontVariant.findFirst({
    where: { id: variantId, familyId },
    select: { id: true, fileUrl: true },
  });
  if (!existing) return null;

  await getStorage()
    .delete(extractStorageKey(existing.fileUrl))
    .catch(() => {});
  await db.fontVariant.delete({ where: { id: variantId } });

  const remaining = await db.fontVariant.count({ where: { familyId } });
  if (remaining === 0) {
    // A variant-less family would stay in the picker and render fallback everywhere.
    await db.fontFamily.delete({ where: { id: familyId } });
  } else {
    await db.fontFamily.update({ where: { id: familyId }, data: { updatedAt: new Date() } });
  }

  return existing;
}
