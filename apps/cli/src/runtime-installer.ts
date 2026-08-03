import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { x as extractTar } from 'tar';
import { RuntimePaths } from './paths.js';

const MAX_RUNTIME_BYTES = 250 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 1024 * 1024;
const INSTALL_LOCK_TIMEOUT_MS = 60_000;
const STALE_INSTALL_LOCK_MS = 10 * 60_000;
const RELEASES_URL = 'https://github.com/draftila/draftila/releases/download';

interface RuntimeManifest {
  version: string;
  target: string;
  executable: string;
  queryEngine: string;
}

export interface InstalledRuntime {
  directory: string;
  executablePath: string;
  queryEnginePath: string;
  version: string;
}

type RuntimeFetcher = (url: string) => Promise<Response>;

export class RuntimeInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeInstallError';
  }
}

export function getRuntimeTarget(platform = process.platform, architecture = process.arch): string {
  const target = `${platform}-${architecture}`;
  if (
    target !== 'darwin-arm64' &&
    target !== 'darwin-x64' &&
    target !== 'linux-arm64' &&
    target !== 'linux-x64' &&
    target !== 'win32-x64'
  ) {
    throw new RuntimeInstallError(`Draftila does not support ${platform} ${architecture}`);
  }
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === 'EPERM';
  }
}

function parseManifest(value: unknown, version: string, target: string): RuntimeManifest {
  const expectedExecutable = target.startsWith('win32-')
    ? 'draftila-runtime.exe'
    : 'draftila-runtime';
  const expectedQueryEngine = 'prisma-query-engine.node';
  if (
    !isRecord(value) ||
    value.version !== version ||
    value.target !== target ||
    typeof value.executable !== 'string' ||
    value.executable !== expectedExecutable ||
    basename(value.executable) !== value.executable ||
    value.queryEngine !== expectedQueryEngine
  ) {
    throw new RuntimeInstallError('The downloaded Draftila runtime manifest is invalid');
  }
  return { version, target, executable: value.executable, queryEngine: expectedQueryEngine };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export class RuntimeInstaller {
  private readonly target: string;

  constructor(
    private readonly paths: RuntimePaths,
    readonly version: string,
    private readonly fetcher: RuntimeFetcher = fetch,
    private readonly environment = process.env,
  ) {
    this.target = getRuntimeTarget();
  }

  async inspectInstalled(): Promise<InstalledRuntime | null> {
    const override = this.environment.DRAFTILA_RUNTIME_PATH;
    if (!override && !(await this.paths.isOwnedDataDirectory())) return null;
    const directory = override ?? this.paths.versionDirectory(this.version);
    try {
      const manifestValue: unknown = JSON.parse(
        await readFile(join(directory, 'manifest.json'), 'utf8'),
      );
      const manifest = parseManifest(manifestValue, this.version, this.target);
      const executablePath = join(directory, manifest.executable);
      const queryEnginePath = join(directory, manifest.queryEngine);
      if (!(await pathExists(executablePath)) || !(await pathExists(queryEnginePath))) return null;
      return { directory, executablePath, queryEnginePath, version: manifest.version };
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async ensureInstalled(): Promise<InstalledRuntime> {
    if (!this.environment.DRAFTILA_RUNTIME_PATH) await this.paths.ensureOwnedDataDirectory();
    const installed = await this.inspectInstalled();
    if (installed) return installed;
    if (this.environment.DRAFTILA_RUNTIME_PATH) {
      throw new RuntimeInstallError(
        `No valid Draftila runtime exists at ${this.environment.DRAFTILA_RUNTIME_PATH}`,
      );
    }
    const installLock = await this.acquireInstallLock();
    if (!installLock) {
      const concurrentlyInstalled = await this.inspectInstalled();
      if (concurrentlyInstalled) return concurrentlyInstalled;
      throw new RuntimeInstallError('The Draftila runtime installation did not complete');
    }
    try {
      const installedByAnotherProcess = await this.inspectInstalled();
      if (installedByAnotherProcess) return installedByAnotherProcess;
      const downloaded = await this.downloadRuntime();
      await this.removeOldVersions();
      return downloaded;
    } finally {
      await installLock.close();
      await rm(this.installLockPath, { force: true });
    }
  }

  async removeInstalled(): Promise<void> {
    if (this.environment.DRAFTILA_RUNTIME_PATH) return;
    await this.paths.assertSafePurgeTarget();
    await rm(this.paths.runtimeDirectory, { recursive: true, force: true });
  }

  private async downloadRuntime(): Promise<InstalledRuntime> {
    const assetName = `draftila-runtime-v${this.version}-${this.target}.tar.gz`;
    const releaseBase =
      this.environment.DRAFTILA_RELEASE_BASE_URL ??
      `${RELEASES_URL}/cli-v${encodeURIComponent(this.version)}`;
    const checksums = await this.fetchText(`${releaseBase}/checksums.txt`);
    const expectedChecksum = this.findChecksum(checksums, assetName);
    const archive = await this.fetchBuffer(`${releaseBase}/${assetName}`);
    const actualChecksum = createHash('sha256').update(archive).digest('hex');
    if (actualChecksum !== expectedChecksum) {
      throw new RuntimeInstallError('The Draftila runtime checksum did not match');
    }

    const parentDirectory = this.paths.runtimeDirectory;
    const destination = this.paths.versionDirectory(this.version);
    const temporaryDirectory = join(parentDirectory, `.install-${process.pid}-${Date.now()}`);
    const archivePath = join(temporaryDirectory, assetName);
    let extractedBytes = 0;
    await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(archivePath, archive, { mode: 0o600 });
      await extractTar({
        cwd: temporaryDirectory,
        file: archivePath,
        strict: true,
        filter: (path, entry) => {
          const portablePath = path.replaceAll('\\', '/');
          const pathSegments = portablePath.split('/');
          const entryType = isRecord(entry) ? entry.type : null;
          const entrySize = isRecord(entry) && typeof entry.size === 'number' ? entry.size : 0;
          extractedBytes += entrySize;
          if (
            isAbsolute(portablePath) ||
            /^[a-z]:\//i.test(portablePath) ||
            pathSegments.includes('..') ||
            entryType === 'SymbolicLink' ||
            entryType === 'Link'
          ) {
            throw new RuntimeInstallError('The Draftila runtime archive contains an unsafe path');
          }
          if (extractedBytes > MAX_EXTRACTED_BYTES) {
            throw new RuntimeInstallError('The Draftila runtime archive is unexpectedly large');
          }
          return true;
        },
      });
      await rm(archivePath, { force: true });
      const manifestValue: unknown = JSON.parse(
        await readFile(join(temporaryDirectory, 'manifest.json'), 'utf8'),
      );
      const manifest = parseManifest(manifestValue, this.version, this.target);
      const executablePath = join(temporaryDirectory, manifest.executable);
      const queryEnginePath = join(temporaryDirectory, manifest.queryEngine);
      if (!(await pathExists(executablePath))) {
        throw new RuntimeInstallError('The Draftila runtime executable is missing');
      }
      if (!(await pathExists(queryEnginePath))) {
        throw new RuntimeInstallError('The Draftila Prisma query engine is missing');
      }
      if (process.platform !== 'win32') await chmod(executablePath, 0o755);
      await rm(destination, { recursive: true, force: true });
      await rename(temporaryDirectory, destination);
      return {
        directory: destination,
        executablePath: join(destination, manifest.executable),
        queryEnginePath: join(destination, manifest.queryEngine),
        version: manifest.version,
      };
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private get installLockPath(): string {
    return join(this.paths.runtimeDirectory, '.install.lock');
  }

  private async acquireInstallLock(): Promise<FileHandle | null> {
    await mkdir(this.paths.runtimeDirectory, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + INSTALL_LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const handle = await open(this.installLockPath, 'wx', 0o600);
        await handle.writeFile(`${process.pid}\n`);
        return handle;
      } catch (error) {
        if (!isRecord(error) || error.code !== 'EEXIST') throw error;
        const installed = await this.inspectInstalled();
        if (installed) return null;
        if (await this.isInstallLockStale()) {
          await rm(this.installLockPath, { force: true });
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new RuntimeInstallError('Timed out waiting for another Draftila runtime installation');
  }

  private async isInstallLockStale(): Promise<boolean> {
    try {
      const ownerPid = Number.parseInt((await readFile(this.installLockPath, 'utf8')).trim(), 10);
      if (Number.isInteger(ownerPid) && ownerPid > 0) return !isProcessAlive(ownerPid);
      return Date.now() - (await stat(this.installLockPath)).mtimeMs > STALE_INSTALL_LOCK_MS;
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return false;
      return false;
    }
  }

  private async removeOldVersions(): Promise<void> {
    const entries = await readdir(this.paths.runtimeDirectory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== this.version)
        .map((entry) => rm(join(this.paths.runtimeDirectory, entry.name), { recursive: true })),
    );
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetcher(url);
    if (!response.ok) throw new RuntimeInstallError(`Unable to download ${url}`);
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_CHECKSUM_BYTES) {
      throw new RuntimeInstallError('The Draftila runtime checksum file is unexpectedly large');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_CHECKSUM_BYTES) {
      throw new RuntimeInstallError('The Draftila runtime checksum file is unexpectedly large');
    }
    return buffer.toString('utf8');
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const response = await this.fetcher(url);
    if (!response.ok) throw new RuntimeInstallError(`Unable to download ${url}`);
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_RUNTIME_BYTES) {
      throw new RuntimeInstallError('The Draftila runtime download is unexpectedly large');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RUNTIME_BYTES) {
      throw new RuntimeInstallError('The Draftila runtime download is unexpectedly large');
    }
    return buffer;
  }

  private findChecksum(contents: string, assetName: string): string {
    for (const line of contents.split('\n')) {
      const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (match?.[2] === assetName) return match[1]!.toLowerCase();
    }
    throw new RuntimeInstallError(`No checksum was published for ${assetName}`);
  }
}
