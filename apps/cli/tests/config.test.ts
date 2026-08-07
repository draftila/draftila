import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildOrigin,
  ConfigStore,
  createDefaultConfig,
  parseConfig,
  validatePort,
  validatePublicHostname,
} from '../src/config';

const temporaryDirectories: string[] = [];

async function createStore(): Promise<ConfigStore> {
  const directory = await mkdtemp(join(tmpdir(), 'draftila-config-test-'));
  temporaryDirectories.push(directory);
  return new ConfigStore(directory);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => new ConfigStore(directory).remove()),
  );
});

describe('configuration', () => {
  test('creates secure defaults', () => {
    const config = createDefaultConfig();
    expect(config.bindAddress).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.publicHostname).toBe('localhost');
    expect(config.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  test('builds origins for hostnames and IPv6 addresses', () => {
    expect(buildOrigin({ bindAddress: '127.0.0.1', port: 3001, publicHostname: 'localhost' })).toBe(
      'http://localhost:3001',
    );
    expect(buildOrigin({ bindAddress: '0.0.0.0', port: 4000, publicHostname: '::1' })).toBe(
      'http://[::1]:4000',
    );
  });

  test('validates ports and public hostnames', () => {
    expect(validatePort(1)).toBeNull();
    expect(validatePort(65535)).toBeNull();
    expect(validatePort(0)).toBeString();
    expect(validatePort(1.5)).toBeString();
    expect(validatePublicHostname('draftila.local')).toBeNull();
    expect(validatePublicHostname('192.168.1.10')).toBeNull();
    expect(validatePublicHostname('')).toBeString();
    expect(validatePublicHostname('http://localhost')).toBeString();
    expect(validatePublicHostname('bad host')).toBeString();
    expect(validatePublicHostname(':::')).toBeString();
  });

  test('parses valid configuration and rejects invalid values', () => {
    const config = createDefaultConfig();
    expect(parseConfig(config)).toEqual(config);
    expect(() => parseConfig(null)).toThrow('JSON object');
    expect(() => parseConfig({ ...config, version: 2 })).toThrow('version');
    expect(() => parseConfig({ ...config, bindAddress: 'localhost' })).toThrow('binding');
    expect(() => parseConfig({ ...config, port: 70000 })).toThrow('port');
    expect(() => parseConfig({ ...config, publicHostname: '/' })).toThrow('hostname');
    expect(() => parseConfig({ ...config, authSecret: 'short' })).toThrow('secret');
  });

  test('saves, loads, and removes configuration', async () => {
    const store = await createStore();
    const config = createDefaultConfig();
    expect(await store.load()).toBeNull();
    await store.save(config);
    expect(await store.load()).toEqual(config);
    expect(JSON.parse(await readFile(store.filePath, 'utf8'))).toEqual(config);
    if (process.platform !== 'win32') {
      expect((await stat(store.filePath)).mode & 0o777).toBe(0o600);
    }
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  test('reports malformed JSON with its path', async () => {
    const store = await createStore();
    await writeFile(store.filePath, '{');
    await expect(store.load()).rejects.toThrow(`Invalid JSON in ${store.filePath}`);
  });

  test('removes only Draftila configuration', async () => {
    const store = await createStore();
    const siblingPath = join(dirname(store.filePath), 'keep.txt');
    await store.save(createDefaultConfig());
    await writeFile(siblingPath, 'keep');
    await store.remove();
    expect(await readFile(siblingPath, 'utf8')).toBe('keep');
    await rm(siblingPath);
    await store.remove();
  });
});
