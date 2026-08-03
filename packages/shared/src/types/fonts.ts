import type { z } from 'zod';
import type {
  fontFamilySchema,
  fontFormatSchema,
  fontStyleSchema,
  fontVariantSchema,
} from '../schemas/fonts';

export type FontStyle = z.infer<typeof fontStyleSchema>;
export type FontFormat = z.infer<typeof fontFormatSchema>;
export type FontVariantDto = z.infer<typeof fontVariantSchema>;
export type FontFamilyDto = z.infer<typeof fontFamilySchema>;
