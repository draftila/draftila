import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c as createTar } from 'tar';
import { RuntimeInstaller, getRuntimeTarget } from '../src/runtime-installer';
import { RuntimePaths } from '../src/paths';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('RuntimeInstaller', () => {
  test('installs a checksum-verified runtime for the current platform', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftila-runtime-installer-'));
    directories.push(directory);
    const source = join(directory, 'source');
    const archivePath = join(directory, 'runtime.tar.gz');
    const executable = process.platform === 'win32' ? 'draftila-runtime.exe' : 'draftila-runtime';
    const target = getRuntimeTarget();
    await mkdir(source, { recursive: true });
    await writeFile(join(source, executable), 'executable');
    await writeFile(
      join(source, 'manifest.json'),
      JSON.stringify({ version: '0.6.1', target, executable }),
    );
    await createTar({ cwd: source, file: archivePath, gzip: true }, ['.']);
    const archive = await readFile(archivePath);
    const checksum = createHash('sha256').update(archive).digest('hex');
    const assetName = `draftila-runtime-v0.6.1-${target}.tar.gz`;
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.endsWith('checksums.txt')) return new Response(`${checksum}  ${assetName}\n`);
      if (url.endsWith(assetName)) return new Response(archive);
      return new Response('not found', { status: 404 });
    };
    const paths = new RuntimePaths(join(directory, 'data'));
    const installer = new RuntimeInstaller(paths, '0.6.1', fetcher, {
      DRAFTILA_RELEASE_BASE_URL: 'https://example.test/runtime',
    });

    const installed = await installer.ensureInstalled();
    expect(installed.version).toBe('0.6.1');
    expect(await readFile(installed.executablePath, 'utf8')).toBe('executable');
    expect(await installer.inspectInstalled()).toEqual(installed);
  });

  test('rejects unsupported platforms and invalid checksums', async () => {
    expect(() => getRuntimeTarget('freebsd', 'x64')).toThrow('does not support');
    const directory = await mkdtemp(join(tmpdir(), 'draftila-runtime-installer-'));
    directories.push(directory);
    const target = getRuntimeTarget();
    const assetName = `draftila-runtime-v0.6.1-${target}.tar.gz`;
    const installer = new RuntimeInstaller(
      new RuntimePaths(join(directory, 'data')),
      '0.6.1',
      async (input) =>
        String(input).endsWith('checksums.txt')
          ? new Response(`${'0'.repeat(64)}  ${assetName}\n`)
          : new Response('invalid archive'),
      { DRAFTILA_RELEASE_BASE_URL: 'https://example.test/runtime' },
    );
    await expect(installer.ensureInstalled()).rejects.toThrow('checksum');
  });

  test('rejects an executable path outside the runtime directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftila-runtime-installer-'));
    directories.push(directory);
    const runtimeDirectory = join(directory, 'runtime');
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(
      join(runtimeDirectory, 'manifest.json'),
      JSON.stringify({
        version: '0.6.1',
        target: getRuntimeTarget(),
        executable: '../draftila-runtime',
      }),
    );
    const installer = new RuntimeInstaller(
      new RuntimePaths(join(directory, 'data')),
      '0.6.1',
      fetch,
      { DRAFTILA_RUNTIME_PATH: runtimeDirectory },
    );

    await expect(installer.inspectInstalled()).rejects.toThrow('manifest is invalid');
  });
});
