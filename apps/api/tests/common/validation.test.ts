import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ValidationError } from '../../src/common/errors';
import { validateImageUpload, validateOrThrow } from '../../src/common/lib/validation';

describe('validateOrThrow', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  test('returns parsed data on success', () => {
    const result = validateOrThrow(schema, { name: 'Alice', age: 30 });
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  test('throws ValidationError on failure', () => {
    expect(() => validateOrThrow(schema, { name: '', age: -1 })).toThrow(ValidationError);
  });

  test('includes field errors in ValidationError', () => {
    try {
      validateOrThrow(schema, { name: '' });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.fieldErrors).toHaveProperty('name');
    }
  });
});

function mockRequest(
  contentType: string,
  body: ArrayBuffer,
): { header: () => string; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    header: () => contentType,
    arrayBuffer: () => Promise.resolve(body),
  };
}

describe('validateImageUpload', () => {
  test('returns Buffer for valid image', async () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff]);
    const req = mockRequest('image/jpeg', data.buffer as ArrayBuffer);
    const result = await validateImageUpload(req as never, 'logo');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(3);
  });

  test('throws for non-image content type', async () => {
    const req = mockRequest('text/plain', new ArrayBuffer(1));
    await expect(validateImageUpload(req as never, 'logo')).rejects.toThrow(ValidationError);
  });

  test('throws for empty body', async () => {
    const req = mockRequest('image/png', new ArrayBuffer(0));
    await expect(validateImageUpload(req as never, 'logo')).rejects.toThrow(ValidationError);
  });

  test('throws for oversized body', async () => {
    const req = mockRequest('image/png', new ArrayBuffer(600 * 1024));
    try {
      await validateImageUpload(req as never, 'thumbnail');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.fieldErrors['thumbnail']![0]).toBe('Thumbnail must be under 512KB');
    }
  });
});
