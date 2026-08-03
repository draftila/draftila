import { uploadFontSchema } from '@draftila/shared';
import { Hono } from 'hono';
import { NotFoundError, ValidationError } from '../../common/errors';
import { validateOrThrow } from '../../common/lib/validation';
import { requireAdmin } from '../../common/middleware/admin';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { checkRateLimit } from '../../common/middleware/rate-limit';
import { parseFont } from './font-parse';
import * as fontsService from './fonts.service';

const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const fontRoutes = new Hono<AuthEnv>();

fontRoutes.get('/', requireAuth, async (c) => {
  const families = await fontsService.listFamilies();
  return c.json({ data: families });
});

fontRoutes.post('/', requireAuth, requireAdmin, async (c) => {
  const blocked = checkRateLimit(c, 'font-upload', { windowMs: 60_000, max: 40 });
  if (blocked) return blocked;

  // A missing (chunked) or malformed header must be rejected too, or the bound is unenforceable.
  const contentLength = Number(c.req.header('content-length'));
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
    throw new ValidationError({
      file: ['Request must be under 32MB with a Content-Length header'],
    });
  }

  const formData = await c.req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new ValidationError({ file: ['A font file is required'] });
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ValidationError({ file: ['Font file must be under 30MB'] });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const parsed = parseFont(bytes);

  // The override and the font's own family name are equally untrusted, so whichever is used goes
  // through the same single validation pass.
  const nameField = formData.get('name');
  const override = typeof nameField === 'string' && nameField.trim() !== '' ? nameField : null;
  const { name } = validateOrThrow(uploadFontSchema.required(), {
    name: override ?? parsed.familyName,
  });

  const { family, variant } = await fontsService.createVariant({ name, parsed, bytes });

  return c.json({ data: family, variant, warnings: parsed.warnings }, 201);
});

fontRoutes.delete('/:familyId', requireAuth, requireAdmin, async (c) => {
  const removed = await fontsService.removeFamily(c.req.param('familyId'));
  if (!removed) throw new NotFoundError('Font family');
  return c.json({ ok: true });
});

fontRoutes.delete('/:familyId/variants/:variantId', requireAuth, requireAdmin, async (c) => {
  const removed = await fontsService.removeVariant(
    c.req.param('familyId'),
    c.req.param('variantId'),
  );
  if (!removed) throw new NotFoundError('Font variant');
  return c.json({ ok: true });
});

export { fontRoutes };
