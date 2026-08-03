import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultConfig } from '../src/config';
import { RuntimeInstaller, getRuntimeTarget } from '../src/runtime-installer';
import { RuntimeManager, type ProcessController } from '../src/runtime-manager';
import { RuntimePaths } from '../src/paths';
import type { CommandOptions, CommandResult, ProcessRunner } from '../src/process-runner';

class FakeProcessController implements ProcessController {
  alive = false;
  owned = true;
  terminateCalls = 0;
  onSpawn: (() => Promise<void>) | null = null;
  readonly spawnCalls: Array<{
    command: string;
    args: string[];
    options: { cwd: string; env: NodeJS.ProcessEnv; logPath: string };
  }> = [];

  async spawnDetached(
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; logPath: string },
  ): Promise<number> {
    this.spawnCalls.push({ command, args, options });
    this.alive = true;
    await this.onSpawn?.();
    return 4242;
  }

  isAlive(pid: number): boolean {
    return pid === process.pid || this.alive;
  }

  ownsProcess(): boolean {
    return this.owned;
  }

  terminate(): void {
    this.terminateCalls += 1;
    this.alive = false;
  }
}

class FakeRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options?: CommandOptions }> = [];

  constructor(private readonly result: CommandResult) {}

  async run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    return this.result;
  }
}

class OwnershipCheckingRuntimeInstaller extends RuntimeInstaller {
  constructor(
    private readonly runtimePaths: RuntimePaths,
    version: string,
    runtimeDirectory: string,
  ) {
    super(runtimePaths, version, fetch, { DRAFTILA_RUNTIME_PATH: runtimeDirectory });
  }

  override async ensureInstalled() {
    if (!(await this.runtimePaths.isOwnedDataDirectory())) {
      throw new Error('Installer entered without data directory ownership');
    }
    return super.ensureInstalled();
  }
}

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createRuntimeFixture(): Promise<{
  directory: string;
  paths: RuntimePaths;
  installer: RuntimeInstaller;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'draftila-runtime-manager-'));
  directories.push(directory);
  const runtimeDirectory = join(directory, 'fixture-runtime');
  const executable = process.platform === 'win32' ? 'draftila-runtime.exe' : 'draftila-runtime';
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(join(runtimeDirectory, executable), 'runtime');
  await writeFile(
    join(runtimeDirectory, 'manifest.json'),
    JSON.stringify({ version: '0.6.1', target: getRuntimeTarget(), executable }),
  );
  const paths = new RuntimePaths(join(directory, 'data'));
  return {
    directory,
    paths,
    installer: new RuntimeInstaller(paths, '0.6.1', fetch, {
      DRAFTILA_RUNTIME_PATH: runtimeDirectory,
    }),
  };
}

describe('RuntimeManager', () => {
  test('starts the production runtime with persistent local paths and no Docker dependency', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const runner = new FakeRunner({ exitCode: 0, stdout: '[]', stderr: '' });
    const config = createDefaultConfig();
    const manager = new RuntimeManager(fixture.paths, fixture.installer, runner, {
      processController: processes,
      fetcher: async () => {
        const instanceId = processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID;
        return Response.json({ status: 'ok', instanceId });
      },
      loadConfig: async () => config,
    });

    expect(await manager.runExclusive(() => manager.start(config))).toBe('started');
    const spawn = processes.spawnCalls[0]!;
    const instanceId = spawn.options.env.DRAFTILA_RUNTIME_INSTANCE_ID;
    if (!instanceId) throw new Error('Missing runtime instance ID');
    expect(spawn.args).toEqual(['serve', '--instance-id', instanceId]);
    expect(spawn.options.env.NODE_ENV).toBe('production');
    expect(spawn.options.env.DB_DRIVER).toBe('sqlite');
    expect(spawn.options.env.HOST).toBe('127.0.0.1');
    expect(spawn.options.env.DATABASE_URL).toBe(`file:${fixture.paths.databasePath}`);
    expect(spawn.command).not.toContain('docker');
    expect(await manager.inspect()).toMatchObject({ status: 'running', version: '0.6.1' });

    await manager.stop();
    expect(processes.alive).toBe(false);
    await expect(stat(fixture.paths.statePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('passes administrator passwords through stdin', async () => {
    const fixture = await createRuntimeFixture();
    const runner = new FakeRunner({ exitCode: 0, stdout: '{"success":true}\n', stderr: '' });
    const config = createDefaultConfig();
    const manager = new RuntimeManager(fixture.paths, fixture.installer, runner, {
      processController: new FakeProcessController(),
      loadConfig: async () => config,
    });
    const password = 'a private password';
    await manager.runAdminCommand(['reset-password', '--email', 'admin@example.com'], password);
    const call = runner.calls[0]!;
    expect(call.args.join(' ')).not.toContain(password);
    expect(call.options?.input).toBe(password);
    expect(call.options?.env?.BETTER_AUTH_SECRET).toBe(config.authSecret);
    expect(call.args[0]).toBe('admin');
  });

  test('normal uninstall preserves data and purge removes it', async () => {
    const fixture = await createRuntimeFixture();
    await fixture.paths.ensureOwnedDataDirectory();
    await mkdir(join(fixture.paths.dataDirectory, 'data'), { recursive: true });
    await writeFile(fixture.paths.databasePath, 'database');
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: new FakeProcessController(),
        loadConfig: async () => createDefaultConfig(),
      },
    );

    await manager.uninstall();
    expect(await readFile(fixture.paths.databasePath, 'utf8')).toBe('database');
    await manager.purge();
    await expect(stat(fixture.paths.dataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('refuses to purge a data directory containing the working directory', async () => {
    const paths = new RuntimePaths(process.cwd());
    await expect(paths.assertSafePurgeTarget()).rejects.toThrow('unsafe data directory');
    await expect(new RuntimePaths('/tmp').assertSafePurgeTarget()).rejects.toThrow(
      'unsafe data directory',
    );
  });

  test('refuses to adopt or purge a non-empty unowned data directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftila-unowned-data-'));
    directories.push(directory);
    await writeFile(join(directory, 'unrelated.txt'), 'keep');
    const paths = new RuntimePaths(directory);

    await expect(paths.ensureOwnedDataDirectory()).rejects.toThrow('non-empty unowned');
    await expect(paths.assertSafePurgeTarget()).rejects.toThrow('unowned data directory');
    expect(await readFile(join(directory, 'unrelated.txt'), 'utf8')).toBe('keep');
  });

  test('does not signal a live process when its identity does not match the runtime state', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    let healthMatches = true;
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        fetcher: async () =>
          Response.json({
            status: 'ok',
            instanceId: healthMatches
              ? processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID
              : 'different-instance',
          }),
        loadConfig: async () => config,
      },
    );
    await manager.start(config);
    healthMatches = false;
    processes.owned = false;

    await manager.stop();

    expect(processes.terminateCalls).toBe(0);
    expect(processes.alive).toBe(true);
    await expect(stat(fixture.paths.statePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('serializes concurrent start commands', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        fetcher: async () =>
          Response.json({
            status: 'ok',
            instanceId: processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID,
          }),
        loadConfig: async () => config,
      },
    );

    const results = await Promise.all([manager.start(config), manager.start(config)]);

    expect(results.sort()).toEqual(['running', 'started']);
    expect(processes.spawnCalls).toHaveLength(1);
  });

  test('aborts an unresponsive health request', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    let unresponsive = false;
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        healthRequestTimeoutMs: 10,
        fetcher: async (_url, init) => {
          if (!unresponsive) {
            return Response.json({
              status: 'ok',
              instanceId: processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID,
            });
          }
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          });
        },
        loadConfig: async () => config,
      },
    );
    await manager.start(config);
    unresponsive = true;
    const startedAt = Date.now();

    expect(await manager.inspect()).toMatchObject({ status: 'unhealthy' });
    expect(Date.now() - startedAt).toBeLessThan(250);
  });

  test('terminates a spawned process when state persistence fails', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    await fixture.paths.ensureOwnedDataDirectory();
    processes.onSpawn = () => mkdir(fixture.paths.statePath);
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        fetcher: async () => Response.json({ status: 'ok' }),
        loadConfig: async () => config,
      },
    );

    await expect(manager.start(config)).rejects.toThrow();
    expect(processes.terminateCalls).toBe(1);
    expect(processes.alive).toBe(false);
  });

  test('revalidates data ownership after waiting for a lifecycle lock', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    const runtimeDirectory = join(fixture.directory, 'fixture-runtime');
    const installer = new OwnershipCheckingRuntimeInstaller(
      fixture.paths,
      '0.6.1',
      runtimeDirectory,
    );
    await fixture.paths.ensureOwnedDataDirectory();
    await writeFile(fixture.paths.lifecycleLockPath, `${process.pid}\n`, { mode: 0o600 });
    const manager = new RuntimeManager(
      fixture.paths,
      installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        fetcher: async () =>
          Response.json({
            status: 'ok',
            instanceId: processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID,
          }),
        loadConfig: async () => config,
      },
    );

    const start = manager.start(config);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await rm(fixture.paths.dataDirectory, { recursive: true });
    await rm(fixture.paths.lifecycleLockPath);

    await expect(start).resolves.toBe('started');
    expect(await fixture.paths.isOwnedDataDirectory()).toBe(true);
  });

  test('serializes stop behind a start that has not created ownership yet', async () => {
    const fixture = await createRuntimeFixture();
    const processes = new FakeProcessController();
    const config = createDefaultConfig();
    await writeFile(fixture.paths.lifecycleLockPath, `${process.pid}\n`, { mode: 0o600 });
    const manager = new RuntimeManager(
      fixture.paths,
      fixture.installer,
      new FakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      {
        processController: processes,
        fetcher: async () =>
          Response.json({
            status: 'ok',
            instanceId: processes.spawnCalls[0]?.options.env.DRAFTILA_RUNTIME_INSTANCE_ID,
          }),
        loadConfig: async () => config,
      },
    );

    const start = manager.start(config);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stop = manager.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await rm(fixture.paths.lifecycleLockPath);

    await expect(start).resolves.toBe('started');
    await expect(stop).resolves.toBe('stopped');
    expect(processes.alive).toBe(false);
  });
});
