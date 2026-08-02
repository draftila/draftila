import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStorage, initStorage } from '../../src/common/lib/storage';

describe('storage', () => {
  let storageDirectory = '';

  beforeEach(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), 'draftila-storage-'));
    initStorage({ driver: 'local', path: storageDirectory });
  });

  afterEach(async () => {
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

  test.each(['../outside.png', '/outside.png', 'draft-assets/../../outside.png'])(
    'rejects unsafe key %s',
    async (key) => {
      await expect(getStorage().put(key, Buffer.from('unsafe'))).rejects.toThrow(
        'Invalid storage key',
      );
    },
  );
});
