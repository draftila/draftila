import { z } from 'zod';

export const fontStyleSchema = z.enum(['normal', 'italic']);

export const fontFormatSchema = z.enum(['ttf', 'otf', 'woff', 'woff2']);

export const fontWeightSchema = z.coerce.number().int().min(100).max(900).multipleOf(100);

// Permissive Unicode name policy: escaping at each interpolation site (canvas `ctx.font`,
// `@font-face`, SVG attributes, HTML/Tailwind codegen) is the security control; this banned
// character class is defence in depth. `,` is banned because SVG's `font-family` attribute is a
// CSS font list, so a family named "Acme, Bold" would resolve to "Bold" there.
export const fontFamilyNameSchema = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(64)
      .refine(
        (s) => !/[\u0000-\u001f\u007f"'\\<>;{},[\]]/.test(s),
        'Font name may not contain quotes, backslashes, angle brackets, braces, brackets, commas, semicolons or control characters',
      ),
  );

// `file` is validated imperatively; weight and style are always inferred from the font's own
// tables and are never accepted from the client.
export const uploadFontSchema = z.object({
  name: fontFamilyNameSchema.optional(),
});

export const fontVariantSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  weight: fontWeightSchema,
  style: fontStyleSchema,
  format: fontFormatSchema,
  fileUrl: z.string(),
  fileSize: z.number().int(),
  postscriptName: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const fontFamilySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  variants: z.array(fontVariantSchema),
});
