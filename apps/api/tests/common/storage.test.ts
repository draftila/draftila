import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractStorageKey,
  getStorage,
  getStoragePath,
  initStorage,
  replaceStorageFile,
} from '../../src/common/lib/storage';

describe('storage', () => {
  let storageDirectory = '';
  let previousStoragePath = '';

  beforeEach(async () => {
    previousStoragePath = getStoragePath();
    storageDirectory = await mkdtemp(join(tmpdir(), 'draftila-storage-'));
    initStorage({ driver: 'local', path: storageDirectory });
  });

  afterEach(async () => {
    initStorage({ driver: 'local', path: previousStoragePath });
    await rm(storageDirectory, { recursive: true, force: true });
  });

  test('reads stored files and deletes only the requested prefix', async () => {
    const storage = getStorage();
    await storage.put('draft-assets/draft-1/image.png', Buffer.from('first'));
    await storage.put('draft-assets/draft-2/image.png', Buffer.from('second'));

    expect(await storage.get('draft-assets/draft-1/image.png')).toEqual(Buffer.from('first'));

    await storage.deletePrefix('draft-assets/draft-1');

    await expect(storage.get('draft-assets/draft-1/image.png')).rejects.toThrow();
    expect(await storage.get('draft-assets/draft-2/image.png')).toEqual(Buffer.from('second'));
  });

  test.each(['thumbnails', 'logos'])(
    'replaces %s without removing the address held by cached lists',
    async (prefix) => {
      const firstUrl = await replaceStorageFile(prefix, 'jpg', Buffer.from('first'));
      const secondUrl = await replaceStorageFile(prefix, 'jpg', Buffer.from('second'), firstUrl);
      const key = extractStorageKey(firstUrl);

      expect(secondUrl).not.toBe(firstUrl);
      expect(extractStorageKey(secondUrl)).toBe(key);
      expect(await getStorage().get(key)).toEqual(Buffer.from('second'));
      expect(await readdir(join(storageDirectory, prefix))).toHaveLength(1);
    },
  );

  test('preserves the previous image when writing a replacement fails', async () => {
    const url = await replaceStorageFile('thumbnails', 'jpg', Buffer.from('original'));
    const write = Bun.write.bind(Bun);
    const writeSpy = spyOn(Bun, 'write').mockImplementationOnce(async (destination) => {
      await write(destination, Buffer.from('partial'));
      throw new Error('Storage write failed');
    });

    try {
      await expect(
        replaceStorageFile('thumbnails', 'jpg', Buffer.from('replacement'), url),
      ).rejects.toThrow('Storage write failed');
    } finally {
      writeSpy.mockRestore();
    }

    expect(await getStorage().get(extractStorageKey(url))).toEqual(Buffer.from('original'));
    expect(await readdir(join(storageDirectory, 'thumbnails'))).toHaveLength(1);
  });

  test('restores a missing legacy file at its original address', async () => {
    const legacyUrl = '/storage/thumbnails/legacy.jpg';
    const url = await replaceStorageFile('thumbnails', 'jpg', Buffer.from('restored'), legacyUrl);

    expect(extractStorageKey(url)).toBe(extractStorageKey(legacyUrl));
    expect(await getStorage().get(extractStorageKey(legacyUrl))).toEqual(Buffer.from('restored'));
  });

  test('concurrent replacements leave a complete image at every returned address', async () => {
    const originalUrl = await replaceStorageFile('thumbnails', 'jpg', Buffer.from('original'));
    const replacements = [Buffer.alloc(1024, 1), Buffer.alloc(2048, 2), Buffer.alloc(4096, 3)];
    const urls = await Promise.all(
      replacements.map((data) => replaceStorageFile('thumbnails', 'jpg', data, originalUrl)),
    );

    for (const url of [originalUrl, ...urls]) {
      const stored = await getStorage().get(extractStorageKey(url));
      expect(replacements.some((data) => data.equals(stored))).toBe(true);
    }
    expect(await readdir(join(storageDirectory, 'thumbnails'))).toHaveLength(1);
  });

  test('files survive storage reinitialization', async () => {
    const url = await replaceStorageFile('thumbnails', 'jpg', Buffer.from('persistent'));

    initStorage({ driver: 'local', path: storageDirectory });

    expect(await getStorage().get(extractStorageKey(url))).toEqual(Buffer.from('persistent'));
  });

  test('extracts storage keys without URL query parameters or fragments', () => {
    expect(extractStorageKey('/storage/thumbnails/image.jpg?v=abc#preview')).toBe(
      'thumbnails/image.jpg',
    );
  });

  test.each(['../outside.png', '/outside.png', 'draft-assets/../../outside.png'])(
    'rejects unsafe key %s',
    async (key) => {
      await expect(getStorage().put(key, Buffer.from('unsafe'))).rejects.toThrow(
        'Invalid storage key',
      );
    },
  );
});
