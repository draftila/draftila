import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { nanoid } from './utils';

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

function createLocalDriver(basePath: string): StorageDriver {
  return {
    async put(key, data) {
      const filePath = join(basePath, key);
      await mkdir(dirname(filePath), { recursive: true });
      await Bun.write(filePath, data);
      return `/storage/${key}`;
    },
    async delete(key) {
      const filePath = join(basePath, key);
      await unlink(filePath).catch(() => {});
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
