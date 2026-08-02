import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { env } from '../../src/common/lib/env';
import {
  extractStorageKey,
  generateStorageKey,
  getStorage,
  getStoragePath,
} from '../../src/common/lib/storage';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import { cleanDatabase, cleanFonts, createTestUser, getAuthHeaders, makeAdmin } from '../helpers';

interface VariantBody {
  id: string;
  familyId: string;
  weight: number;
  style: string;
  format: string;
  fileUrl: string;
  fileSize: number;
  postscriptName: string | null;
}

interface FamilyBody {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  variants: VariantBody[];
}

interface ErrorBody {
  error: string;
  fieldErrors?: Record<string, string[]>;
}

const FIXTURE_DIR = join(import.meta.dir, '../fixtures/fonts');

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

function storedPath(fileUrl: string): string {
  return join(getStoragePath(), extractStorageKey(fileUrl));
}

async function countBlobs(): Promise<number> {
  const entries = await readdir(join(getStoragePath(), 'fonts')).catch(() => [] as string[]);
  return entries.length;
}

/** A 100-byte WOFF header claiming a 2 GB decompressed sfnt. */
function decompressionBomb(): Buffer {
  const buf = Buffer.alloc(100);
  buf.write('wOFF', 0, 'ascii');
  buf.writeUInt16BE(4, 12);
  buf.writeUInt32BE(2 * 1024 * 1024 * 1024, 16);
  return buf;
}

/** A WOFF header declaring more tables than the cap allows. */
function tooManyTablesBomb(): Buffer {
  const buf = Buffer.alloc(100);
  buf.write('wOFF', 0, 'ascii');
  buf.writeUInt16BE(200, 12);
  buf.writeUInt32BE(1024, 16);
  return buf;
}

/**
 * A WOFF whose header values are all well inside the caps but whose single directory entry
 * declares a 400 MB `origLength` — the size fontkit actually allocates from.
 */
function directoryBomb(): Buffer {
  const buf = Buffer.alloc(64);
  buf.write('wOFF', 0, 'ascii');
  buf.writeUInt16BE(1, 12);
  buf.writeUInt32BE(1024, 16);
  buf.write('glyf', 44, 'ascii');
  buf.writeUInt32BE(64, 48); // offset
  buf.writeUInt32BE(0, 52); // compLength
  buf.writeUInt32BE(400 * 1024 * 1024, 56); // origLength
  return buf;
}

/**
 * JetBrains Mono with its `post` table hidden from the sfnt directory. fontkit's `italicAngle`
 * getter dereferences `post` unguarded, so this used to escape the parse guard as a 500.
 */
function withoutPostTable(): Buffer {
  const buf = Buffer.from(fixture('JetBrainsMono-Regular.ttf'));
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16;
    if (buf.toString('ascii', entry, entry + 4) === 'post') {
      buf.write('zzzz', entry, 'ascii');
      return buf;
    }
  }
  throw new Error('fixture has no post table');
}

describe('fonts', () => {
  let adminHeaders: Headers;
  let memberHeaders: Headers;

  async function upload(
    source: string | Buffer,
    options: { name?: string; headers?: Headers } = {},
  ) {
    const bytes = typeof source === 'string' ? fixture(source) : source;
    const filename = typeof source === 'string' ? source : 'upload.bin';

    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], filename));
    if (options.name) form.append('name', options.name);

    // `app.request` builds the Request in-process and never populates Content-Length, which the
    // route now requires; a real HTTP client always sends it.
    const headers = new Headers(options.headers ?? adminHeaders);
    headers.set('content-length', String(bytes.byteLength));

    return app.request('/api/fonts', { method: 'POST', headers, body: form });
  }

  async function uploadFamily(source: string, name: string): Promise<FamilyBody> {
    const res = await upload(source, { name });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: FamilyBody };
    return body.data;
  }

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');

    const admin = await createTestUser({
      email: 'font-admin@draftila.com',
      password: 'password123',
      name: 'Font Admin',
    });
    await makeAdmin(admin.user.id);
    adminHeaders = await getAuthHeaders('font-admin@draftila.com', 'password123');

    await createTestUser({
      email: 'font-member@draftila.com',
      password: 'password123',
      name: 'Font Member',
    });
    memberHeaders = await getAuthHeaders('font-member@draftila.com', 'password123');
  });

  beforeEach(async () => {
    await cleanFonts();
    resetRateLimitStore('font-upload');
    resetRateLimitStore('api-general');
  });

  describe('authorization', () => {
    test('GET /api/fonts returns 401 without auth', async () => {
      const res = await app.request('/api/fonts');
      expect(res.status).toBe(401);
    });

    test('GET /api/fonts is available to non-admins', async () => {
      const res = await app.request('/api/fonts', { headers: memberHeaders });
      expect(res.status).toBe(200);
    });

    test('POST /api/fonts returns 403 for a non-admin', async () => {
      const res = await upload('JetBrainsMono-Regular.ttf', {
        name: 'Acme Mono',
        headers: memberHeaders,
      });
      expect(res.status).toBe(403);
    });

    test('DELETE /api/fonts/:familyId returns 403 for a non-admin', async () => {
      const family = await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');

      const res = await app.request(`/api/fonts/${family.id}`, {
        method: 'DELETE',
        headers: memberHeaders,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('upload', () => {
    test('POST /api/fonts creates a family and returns { data, variant, warnings }', async () => {
      const res = await upload('JetBrainsMono-Regular.ttf', { name: 'Acme Mono' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        data: FamilyBody;
        variant: VariantBody;
        warnings: string[];
      };
      expect(body.data.name).toBe('Acme Mono');
      expect(body.data.variants).toHaveLength(1);
      expect(body.data.variants[0]!.weight).toBe(400);
      expect(body.data.variants[0]!.style).toBe('normal');
      expect(body.data.variants[0]!.format).toBe('ttf');
      expect(body.data.variants[0]!.postscriptName).toBe('JetBrainsMono-Regular');
      expect(body.variant).toEqual(body.data.variants[0]!);
      expect(body.warnings).toBeArray();
    });

    test('`variant` is the face just created, not the heaviest in the family', async () => {
      await upload('JetBrainsMono-BoldItalic.woff2', { name: 'Acme Mono' });
      const res = await upload('JetBrainsMono-Regular.ttf', { name: 'Acme Mono' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: FamilyBody; variant: VariantBody };
      // `familySelect` orders variants by ascending weight, so the last row is the 700 italic.
      expect(body.data.variants.at(-1)!.weight).toBe(700);
      expect(body.variant.weight).toBe(400);
      expect(body.variant.style).toBe('normal');
    });

    test('GET /api/fonts returns { data } with nested variants', async () => {
      await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');

      const res = await app.request('/api/fonts', { headers: adminHeaders });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: FamilyBody[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.variants).toHaveLength(1);
    });

    test('a second upload with the same name adds a variant to the same family', async () => {
      const first = await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');
      const second = await uploadFamily('JetBrainsMono-BoldItalic.woff2', 'Acme Mono');

      expect(second.id).toBe(first.id);
      expect(second.variants).toHaveLength(2);
      expect(await db.fontFamily.count()).toBe(1);
    });

    test('the family name matches case-insensitively', async () => {
      const first = await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');
      const second = await uploadFamily('JetBrainsMono-BoldItalic.woff2', 'ACME MONO');

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Acme Mono');
    });

    test('a new family colliding with a Google font name returns 409', async () => {
      // No `name` field, so the family name is the parsed "JetBrains Mono" — a curated Google font.
      const res = await upload('JetBrainsMono-Regular.ttf');

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error).toContain('built-in Google font');
      expect(await db.fontFamily.count()).toBe(0);
    });

    test('a file that is not a font returns 400', async () => {
      const res = await upload(Buffer.from('this is definitely not a font'), { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('Unsupported font format');
    });

    test('a file over 30MB returns 400', async () => {
      const oversize = Buffer.alloc(31 * 1024 * 1024);
      oversize.write('wOF2', 0, 'ascii');

      const res = await upload(oversize, { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('under 30MB');
    });

    test('a variable font is rejected with 400', async () => {
      const res = await upload('JetBrainsMono-Variable.ttf', { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('Variable fonts are not supported yet');
    });

    test('a WOFF declaring a huge decompressed size is rejected with 400', async () => {
      const res = await upload(decompressionBomb(), { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('too large after decompression');
    });

    test('a WOFF declaring too many tables is rejected with 400', async () => {
      const res = await upload(tooManyTablesBomb(), { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('too many tables');
    });

    test('a WOFF whose table directory declares an oversized table is rejected with 400', async () => {
      // Header `numTables`/`totalSfntSize` are both inside the caps here — only the directory
      // entry is oversized, and that is the number fontkit allocates from.
      const res = await upload(directoryBomb(), { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('too large after decompression');
    });

    test('a font with no post table is rejected with 400, not a 500', async () => {
      const res = await upload(withoutPostTable(), { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('Could not parse font file');
    });

    test('a request without a Content-Length header is rejected with 400', async () => {
      const form = new FormData();
      form.append(
        'file',
        new File([new Uint8Array(fixture('JetBrainsMono-Regular.ttf'))], 'a.ttf'),
      );

      const res = await app.request('/api/fonts', {
        method: 'POST',
        headers: adminHeaders,
        body: form,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('Content-Length');
    });

    test('a font without an OS/2 table is rejected with 400', async () => {
      const res = await upload('JetBrainsMono-NoOS2.ttf', { name: 'Acme Mono' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.file![0]).toContain('no OS/2 table');
    });

    test('an invalid family name is rejected with 400', async () => {
      const res = await upload('JetBrainsMono-Regular.ttf', { name: 'Acme", serif' });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.fieldErrors!.name![0]).toContain('may not contain quotes');
    });
  });

  describe('inference', () => {
    test('weight and style come from the font tables, with warnings', async () => {
      const res = await upload('JetBrainsMono-BoldItalic.woff2', { name: 'Acme Mono' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: FamilyBody; warnings: string[] };
      expect(body.data.variants[0]!.weight).toBe(700);
      expect(body.data.variants[0]!.style).toBe('italic');
      expect(body.warnings).toEqual([
        'Weight inferred as 700 from OS/2 usWeightClass 700',
        'Style inferred as italic from OS/2 fsSelection',
      ]);
    });

    test('a duplicate weight/style returns 409 and writes no blob', async () => {
      await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');

      const before = await countBlobs();
      // Same 400/normal face in a different container — the pair collides on inferred tags.
      const res = await upload('JetBrainsMono-Regular.woff', { name: 'Acme Mono' });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error).toBe(
        'This family already has a 400 normal variant. If your files genuinely differ, their internal OS/2 metadata is wrong or duplicated — fix it in font tooling (fontTools, Glyphs) and re-upload.',
      );
      expect(await countBlobs()).toBe(before);
    });
  });

  describe('stored files', () => {
    test.each([
      ['JetBrainsMono-Regular.ttf', 'ttf'],
      ['JetBrainsMono-Regular.woff', 'woff'],
      ['JetBrainsMono-Regular.woff2', 'woff2'],
    ])('%s is stored verbatim as .%s', async (name, format) => {
      const family = await uploadFamily(name, `Acme ${format}`);
      const variant = family.variants[0]!;

      expect(variant.format).toBe(format);
      expect(variant.fileUrl).toEndWith(`.${format}`);
      expect(variant.fileUrl).toStartWith('/storage/fonts/');

      const source = fixture(name);
      expect(variant.fileSize).toBe(source.byteLength);
      expect(readFileSync(storedPath(variant.fileUrl)).equals(source)).toBe(true);
    });
  });

  describe('delete', () => {
    test('DELETE /api/fonts/:familyId removes the files and cascades variants', async () => {
      await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');
      const family = await uploadFamily('JetBrainsMono-BoldItalic.woff2', 'Acme Mono');
      const paths = family.variants.map((v) => storedPath(v.fileUrl));

      const res = await app.request(`/api/fonts/${family.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(await db.fontFamily.count()).toBe(0);
      expect(await db.fontVariant.count()).toBe(0);
      for (const path of paths) {
        expect(await Bun.file(path).exists()).toBe(false);
      }
    });

    test('DELETE /api/fonts/:familyId returns 404 for an unknown family', async () => {
      const res = await app.request('/api/fonts/nonexistent', {
        method: 'DELETE',
        headers: adminHeaders,
      });
      expect(res.status).toBe(404);
    });

    test('deleting one of several variants keeps the family and bumps updatedAt', async () => {
      await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');
      const family = await uploadFamily('JetBrainsMono-BoldItalic.woff2', 'Acme Mono');
      const variant = family.variants.find((v) => v.style === 'italic')!;
      const before = new Date(family.updatedAt);

      await new Promise((r) => setTimeout(r, 10));
      const res = await app.request(`/api/fonts/${family.id}/variants/${variant.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(await Bun.file(storedPath(variant.fileUrl)).exists()).toBe(false);

      const after = await db.fontFamily.findUnique({ where: { id: family.id } });
      expect(after).not.toBeNull();
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });

    test('deleting the last variant deletes the family too', async () => {
      const family = await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');
      const variant = family.variants[0]!;

      const res = await app.request(`/api/fonts/${family.id}/variants/${variant.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });

      expect(res.status).toBe(200);

      const list = await app.request('/api/fonts', { headers: adminHeaders });
      const body = (await list.json()) as { data: FamilyBody[] };
      expect(body.data).toHaveLength(0);
    });

    test('DELETE variant returns 404 when it does not belong to the family', async () => {
      const family = await uploadFamily('JetBrainsMono-Regular.ttf', 'Acme Mono');

      const res = await app.request(`/api/fonts/${family.id}/variants/nonexistent`, {
        method: 'DELETE',
        headers: adminHeaders,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('storage headers', () => {
    test('/storage/fonts/* is served cross-origin without credentials', async () => {
      const family = await uploadFamily('JetBrainsMono-Regular.woff2', 'Acme Mono');

      const res = await app.request(family.variants[0]!.fileUrl);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });

    test('other /storage/* paths keep the credentialed CORS policy', async () => {
      const url = await getStorage().put(
        generateStorageKey('test-assets', 'bin'),
        Buffer.from('not a font'),
      );

      // An Origin header is required, or hono's cors sets no ACAO at all and the assertion below
      // would pass for the wrong reason.
      const res = await app.request(url, { headers: { origin: env.FRONTEND_URL } });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(env.FRONTEND_URL);
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });
  });
});
