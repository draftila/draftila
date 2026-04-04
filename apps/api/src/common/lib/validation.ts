import type { HonoRequest } from 'hono';
import type { ZodType, ZodTypeDef } from 'zod';
import { ValidationError } from '../errors';

export function validateOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }
  return parsed.data;
}

export async function validateImageUpload(
  req: HonoRequest,
  fieldName: string,
  maxSizeBytes = 512 * 1024,
): Promise<Buffer> {
  const contentType = req.header('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new ValidationError({ [fieldName]: ['Body must be an image'] });
  }

  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new ValidationError({ [fieldName]: ['Body must not be empty'] });
  }

  if (arrayBuffer.byteLength > maxSizeBytes) {
    const label = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    const sizeKB = Math.floor(maxSizeBytes / 1024);
    throw new ValidationError({ [fieldName]: [`${label} must be under ${sizeKB}KB`] });
  }

  return Buffer.from(arrayBuffer);
}
