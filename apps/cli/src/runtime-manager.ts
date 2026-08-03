import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { closeSync, openSync } from 'node:fs';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { DraftilaConfig } from './config.js';
import { buildOrigin } from './config.js';
import { RuntimeInstaller, type InstalledRuntime } from './runtime-installer.js';
import { RuntimePaths } from './paths.js';
import type { ProcessRunner } from './process-runner.js';

export type RuntimeStatus = 'not-installed' | 'running' | 'stopped' | 'unhealthy';

export interface RuntimeInspection {
  status: RuntimeStatus;
  configHash: string | null;
  version: string | null;
}

interface RuntimeState {
  version: string;
  pid: number;
  port: number;
  instanceId: string;
  configHash: string;
  executablePath: string;
  startedAt: string;
}

interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
}

export interface ProcessController {
  spawnDetached(command: string, args: string[], options: SpawnOptions): Promise<number>;
  isAlive(pid: number): boolean;
  ownsProcess(pid: number, executablePath: string, instanceId: string): boolean;
  terminate(pid: number, force: boolean): void;
}

export interface AdminCommandRunner {
  runAdminCommand(args: string[], input?: string): Promise<string>;
}

export interface RuntimeController extends AdminCommandRunner {
  readonly version: string;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  getConfigHash(config: DraftilaConfig): string;
  inspect(): Promise<RuntimeInspection>;
  start(config: DraftilaConfig): Promise<'running' | 'started' | 'restarted'>;
  stop(): Promise<'not-installed' | 'stopped'>;
  restart(config: DraftilaConfig): Promise<void>;
  uninstall(): Promise<void>;
  purge(): Promise<void>;
}

type HealthFetcher = (url: string, init?: RequestInit) => Promise<Response>;
type ConfigLoader = () => Promise<DraftilaConfig | null>;

export interface RuntimeManagerOptions {
  processController?: ProcessController;
  fetcher?: HealthFetcher;
  loadConfig?: ConfigLoader;
  healthRequestTimeoutMs?: number;
}

const LIFECYCLE_LOCK_TIMEOUT_MS = 90_000;
const STALE_LIFECYCLE_LOCK_MS = 5 * 60_000;

export class RuntimeProcessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeProcessError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseState(value: unknown): RuntimeState {
  if (
    !isRecord(value) ||
    typeof value.version !== 'string' ||
    typeof value.pid !== 'number' ||
    !Number.isInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.port !== 'number' ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535 ||
    typeof value.instanceId !== 'string' ||
    typeof value.configHash !== 'string' ||
    typeof value.executablePath !== 'string' ||
    typeof value.startedAt !== 'string'
  ) {
    throw new RuntimeProcessError('The Draftila runtime state file is invalid');
  }
  return {
    version: value.version,
    pid: value.pid,
    port: value.port,
    instanceId: value.instanceId,
    configHash: value.configHash,
    executablePath: value.executablePath,
    startedAt: value.startedAt,
  };
}

export class NodeProcessController implements ProcessController {
  async spawnDetached(command: string, args: string[], options: SpawnOptions): Promise<number> {
    await mkdir(dirname(options.logPath), { recursive: true, mode: 0o700 });
    const logDescriptor = openSync(options.logPath, 'a', 0o600);
    try {
      const child = spawn(command, args, {
        cwd: options.cwd,
        detached: true,
        env: options.env,
        shell: false,
        stdio: ['ignore', logDescriptor, logDescriptor],
        windowsHide: true,
      });
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      if (!child.pid) throw new RuntimeProcessError('Draftila did not return a process ID');
      child.unref();
      return child.pid;
    } finally {
      closeSync(logDescriptor);
    }
  }

  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return isRecord(error) && error.code === 'EPERM';
    }
  }

  ownsProcess(pid: number, executablePath: string, instanceId: string): boolean {
    try {
      const commandLine =
        process.platform === 'win32'
          ? execFileSync(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `$process = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($process) { $process.CommandLine }`,
              ],
              { encoding: 'utf8', timeout: 5_000, windowsHide: true },
            )
          : execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
              encoding: 'utf8',
              timeout: 5_000,
            });
      return commandLine.includes(instanceId) && commandLine.includes(basename(executablePath));
    } catch {
      return false;
    }
  }

  terminate(pid: number, force: boolean): void {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  }
}

class RuntimeStateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<RuntimeState | null> {
    try {
      return parseState(JSON.parse(await readFile(this.path, 'utf8')) as unknown);
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) {
        throw new RuntimeProcessError('The Draftila runtime state file contains invalid JSON');
      }
      throw error;
    }
  }

  async save(state: RuntimeState): Promise<void> {
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.path);
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

class RuntimeLifecycleLock {
  private readonly context = new AsyncLocalStorage<boolean>();

  constructor(
    private readonly path: string,
    private readonly processController: ProcessController,
  ) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return operation();
    const handle = await this.acquire();
    try {
      return await this.context.run(true, operation);
    } finally {
      await handle.close();
      await rm(this.path, { force: true });
    }
  }

  private async acquire(): Promise<FileHandle> {
    const deadline = Date.now() + LIFECYCLE_LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const handle = await open(this.path, 'wx', 0o600);
        await handle.writeFile(`${process.pid}\n`);
        return handle;
      } catch (error) {
        if (!isRecord(error) || error.code !== 'EEXIST') throw error;
        if (await this.isStale()) {
          await rm(this.path, { force: true });
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new RuntimeProcessError('Timed out waiting for another Draftila command to finish');
  }

  private async isStale(): Promise<boolean> {
    try {
      const ownerPid = Number.parseInt((await readFile(this.path, 'utf8')).trim(), 10);
      if (Number.isInteger(ownerPid) && ownerPid > 0) {
        return !this.processController.isAlive(ownerPid);
      }
      return Date.now() - (await stat(this.path)).mtimeMs > STALE_LIFECYCLE_LOCK_MS;
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return false;
      return false;
    }
  }
}

export class RuntimeManager implements AdminCommandRunner {
  private readonly stateStore: RuntimeStateStore;
  private readonly lifecycleLock: RuntimeLifecycleLock;
  private readonly processController: ProcessController;
  private readonly fetcher: HealthFetcher;
  private readonly loadConfig: ConfigLoader;
  private readonly healthRequestTimeoutMs: number;

  constructor(
    private readonly paths: RuntimePaths,
    private readonly installer: RuntimeInstaller,
    private readonly runner: ProcessRunner,
    options: RuntimeManagerOptions = {},
  ) {
    this.processController = options.processController ?? new NodeProcessController();
    this.fetcher = options.fetcher ?? fetch;
    this.loadConfig = options.loadConfig ?? (async () => null);
    this.healthRequestTimeoutMs = options.healthRequestTimeoutMs ?? 2_000;
    this.stateStore = new RuntimeStateStore(paths.statePath);
    this.lifecycleLock = new RuntimeLifecycleLock(paths.lifecycleLockPath, this.processController);
  }

  get version(): string {
    return this.installer.version;
  }

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.lifecycleLock.run(operation);
  }

  getConfigHash(config: DraftilaConfig): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          bindAddress: config.bindAddress,
          port: config.port,
          publicHostname: config.publicHostname,
          authSecret: config.authSecret,
          version: this.version,
        }),
      )
      .digest('hex');
  }

  async inspect(): Promise<RuntimeInspection> {
    if (!(await this.paths.isOwnedDataDirectory())) {
      return { status: 'not-installed', configHash: null, version: null };
    }
    const installed = await this.installer.inspectInstalled();
    const state = await this.stateStore.load();
    if (!state) {
      return {
        status: installed ? 'stopped' : 'not-installed',
        configHash: null,
        version: installed?.version ?? null,
      };
    }
    if (!this.processController.isAlive(state.pid)) {
      await this.stateStore.remove();
      return {
        status: installed ? 'stopped' : 'not-installed',
        configHash: state.configHash,
        version: installed?.version ?? state.version,
      };
    }
    const healthy = await this.hasMatchingHealth(state);
    return {
      status: healthy ? 'running' : 'unhealthy',
      configHash: state.configHash,
      version: state.version,
    };
  }

  async start(config: DraftilaConfig): Promise<'running' | 'started' | 'restarted'> {
    return this.lifecycleLock.run(async () => {
      await this.paths.ensureOwnedDataDirectory();
      return this.startUnlocked(config);
    });
  }

  async stop(): Promise<'not-installed' | 'stopped'> {
    return this.lifecycleLock.run(async () => {
      if (!(await this.paths.isOwnedDataDirectory())) return 'not-installed';
      return this.stopUnlocked();
    });
  }

  async restart(config: DraftilaConfig): Promise<void> {
    await this.lifecycleLock.run(async () => {
      await this.paths.ensureOwnedDataDirectory();
      await this.stopUnlocked();
      await this.startUnlocked(config);
    });
  }

  async runAdminCommand(args: string[], input?: string): Promise<string> {
    return this.lifecycleLock.run(async () => {
      await this.paths.ensureOwnedDataDirectory();
      return this.runAdminCommandUnlocked(args, input);
    });
  }

  async uninstall(): Promise<void> {
    await this.lifecycleLock.run(async () => {
      if (!(await this.paths.isOwnedDataDirectory())) return;
      await this.stopUnlocked();
      await this.installer.removeInstalled();
      await rm(this.paths.logPath, { force: true });
    });
  }

  async purge(): Promise<void> {
    await this.lifecycleLock.run(async () => {
      await this.paths.assertSafePurgeTarget();
      await this.stopUnlocked();
      await rm(this.paths.dataDirectory, { recursive: true, force: true });
    });
  }

  private async startUnlocked(
    config: DraftilaConfig,
  ): Promise<'running' | 'started' | 'restarted'> {
    const inspection = await this.inspect();
    const configHash = this.getConfigHash(config);
    if (inspection.status === 'running' && inspection.configHash === configHash) return 'running';
    const replacingProcess = inspection.status === 'running' || inspection.status === 'unhealthy';
    if (replacingProcess) await this.stopUnlocked();

    const runtime = await this.installer.ensureInstalled();
    await this.ensureDataDirectories();
    const state: RuntimeState = {
      version: runtime.version,
      pid: 0,
      port: config.port,
      instanceId: randomUUID(),
      configHash,
      executablePath: runtime.executablePath,
      startedAt: new Date().toISOString(),
    };
    let spawnedPid: number | null = null;
    try {
      spawnedPid = await this.processController.spawnDetached(
        runtime.executablePath,
        ['serve', '--instance-id', state.instanceId],
        {
          cwd: runtime.directory,
          env: this.createRuntimeEnvironment(config, runtime, state.instanceId),
          logPath: this.paths.logPath,
        },
      );
      state.pid = spawnedPid;
      await this.stateStore.save(state);
      await this.waitUntilHealthy(config.port, state);
    } catch (error) {
      if (spawnedPid && this.processController.isAlive(spawnedPid)) {
        await this.terminateOwnedProcess(state);
      }
      await this.stateStore.remove().catch(() => undefined);
      throw error;
    }
    return replacingProcess ? 'restarted' : 'started';
  }

  private async stopUnlocked(): Promise<'not-installed' | 'stopped'> {
    const state = await this.stateStore.load();
    if (!state) {
      return (await this.installer.inspectInstalled()) ? 'stopped' : 'not-installed';
    }
    if (this.processController.isAlive(state.pid)) {
      const ownsProcess =
        (await this.hasMatchingHealth(state)) ||
        this.processController.ownsProcess(state.pid, state.executablePath, state.instanceId);
      if (ownsProcess) {
        await this.terminateOwnedProcess(state);
      }
    }
    await this.stateStore.remove();
    return 'stopped';
  }

  private async runAdminCommandUnlocked(args: string[], input?: string): Promise<string> {
    const config = await this.loadConfig();
    if (!config) {
      throw new RuntimeProcessError('Configure Draftila before managing administrators');
    }
    const runtime = await this.installer.ensureInstalled();
    await this.ensureDataDirectories();
    const result = await this.runner.run(runtime.executablePath, ['admin', ...args], {
      cwd: runtime.directory,
      env: this.createRuntimeEnvironment(config, runtime, 'admin-command'),
      input,
    });
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim();
      throw new RuntimeProcessError(
        detail ? `Administrator command failed: ${detail}` : 'Administrator command failed',
      );
    }
    return result.stdout.trim();
  }

  private async ensureDataDirectories(): Promise<void> {
    await this.paths.ensureOwnedDataDirectory();
    await Promise.all([
      mkdir(dirname(this.paths.databasePath), { recursive: true, mode: 0o700 }),
      mkdir(this.paths.storageDirectory, { recursive: true, mode: 0o700 }),
      mkdir(dirname(this.paths.logPath), { recursive: true, mode: 0o700 }),
    ]);
  }

  private createRuntimeEnvironment(
    config: DraftilaConfig,
    runtime: InstalledRuntime,
    instanceId: string,
  ): NodeJS.ProcessEnv {
    const publicOrigin = buildOrigin(config);
    const localOrigin = `http://localhost:${config.port}`;
    return {
      ...process.env,
      NODE_ENV: 'production',
      DB_DRIVER: 'sqlite',
      DATABASE_URL: `file:${this.paths.databasePath}`,
      BETTER_AUTH_SECRET: config.authSecret,
      BETTER_AUTH_URL: publicOrigin,
      FRONTEND_URL: publicOrigin,
      FRONTEND_URLS: [...new Set([publicOrigin, localOrigin])].join(','),
      HOST: config.bindAddress,
      PORT: String(config.port),
      STORAGE_DRIVER: 'local',
      STORAGE_PATH: this.paths.storageDirectory,
      WEB_DIST_DIR: join(runtime.directory, 'web'),
      DRAFTILA_RUNTIME_INSTANCE_ID: instanceId,
    };
  }

  private async hasMatchingHealth(state: RuntimeState): Promise<boolean> {
    return this.hasMatchingHealthAt(
      `http://127.0.0.1:${state.port}/api/health`,
      state.instanceId,
      this.healthRequestTimeoutMs,
    );
  }

  private async waitUntilHealthy(
    port: number,
    state: RuntimeState,
    timeoutMs = 60_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${port}/api/health`;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      if (
        await this.hasMatchingHealthAt(
          url,
          state.instanceId,
          Math.min(this.healthRequestTimeoutMs, remainingMs),
        )
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new RuntimeProcessError(
      `Draftila did not become healthy within 60 seconds. Logs: ${this.paths.logPath}`,
    );
  }

  private async hasMatchingHealthAt(
    url: string,
    instanceId: string,
    timeoutMs: number,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      if (!response.ok) return false;
      const value: unknown = await response.json();
      return isRecord(value) && value.instanceId === instanceId;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async terminateOwnedProcess(state: RuntimeState): Promise<void> {
    if (!this.processController.isAlive(state.pid)) return;
    this.processController.terminate(state.pid, false);
    if (await this.waitForExit(state.pid, 10_000)) return;
    if (!this.processController.ownsProcess(state.pid, state.executablePath, state.instanceId)) {
      return;
    }
    this.processController.terminate(state.pid, true);
    await this.waitForExit(state.pid, 2_000);
  }

  private async waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.processController.isAlive(pid)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !this.processController.isAlive(pid);
  }
}
