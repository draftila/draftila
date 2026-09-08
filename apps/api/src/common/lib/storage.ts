import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { nanoid } from './utils';

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  getUrl(key: string): string;
}

function createLocalDriver(basePath: string): StorageDriver {
  const resolvedBasePath = resolve(basePath);
  const storagePrefix = `${resolvedBasePath}/`;

  function resolveKey(key: string): string {
    const filePath = resolve(resolvedBasePath, key);
    if (filePath === resolvedBasePath || !filePath.startsWith(storagePrefix)) {
      throw new Error('Invalid storage key');
    }
    return filePath;
  }

  return {
    async put(key, data) {
      const filePath = resolveKey(key);
      await mkdir(dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${nanoid()}.tmp`;
      try {
        await Bun.write(temporaryPath, data);
        await rename(temporaryPath, filePath);
      } finally {
        await unlink(temporaryPath).catch(() => {});
      }
      return `/storage/${key}`;
    },
    async get(key) {
      return readFile(resolveKey(key));
    },
    async delete(key) {
      await unlink(resolveKey(key)).catch(() => {});
    },
    async deletePrefix(prefix) {
      await rm(resolveKey(prefix), { recursive: true, force: true });
    },
    getUrl(key) {
      return `/storage/${key}`;
    },
  };
}

let driver: StorageDriver | null = null;
let storagePath = '';

export function initStorage(config: { driver: 'local'; path: string }) {
  storagePath = config.path;
  driver = createLocalDriver(config.path);
}

export function getStorage(): StorageDriver {
  if (!driver) throw new Error('Storage not initialized');
  return driver;
}

export function getStoragePath(): string {
  return storagePath;
}

export function generateStorageKey(prefix: string, ext: string): string {
  return `${prefix}/${nanoid()}.${ext}`;
}

export function extractStorageKey(url: string): string {
  return url.split(/[?#]/, 1)[0]!.replace(/^\/storage\//, '');
}

export async function replaceStorageFile(
  prefix: string,
  ext: string,
  data: Buffer,
  existingUrl?: string | null,
): Promise<string> {
  const storage = getStorage();
  const key = existingUrl ? extractStorageKey(existingUrl) : generateStorageKey(prefix, ext);
  const url = await storage.put(key, data);
  const version = createHash('sha256').update(data).digest('hex');
  return `${url}?v=${version}`;
}
