import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const OWNERSHIP_FILE = '.draftila-data';
const OWNERSHIP_CONTENTS = 'draftila-local-data-v1\n';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getDefaultDataDirectory(environment = process.env): string {
  if (environment.DRAFTILA_DATA_DIR) return environment.DRAFTILA_DATA_DIR;
  if (process.platform === 'win32') {
    return join(environment.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Draftila');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Draftila');
  }
  return join(environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'draftila');
}

export class RuntimePaths {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly logPath: string;
  readonly lifecycleLockPath: string;
  readonly ownershipPath: string;
  readonly runtimeDirectory: string;
  readonly statePath: string;
  readonly storageDirectory: string;

  constructor(dataDirectory = getDefaultDataDirectory()) {
    this.dataDirectory = resolve(dataDirectory);
    this.databasePath = join(this.dataDirectory, 'data', 'draftila.sqlite');
    this.logPath = join(this.dataDirectory, 'logs', 'draftila.log');
    this.lifecycleLockPath = join(
      tmpdir(),
      `draftila-${createHash('sha256').update(this.dataDirectory).digest('hex')}.lock`,
    );
    this.ownershipPath = join(this.dataDirectory, OWNERSHIP_FILE);
    this.runtimeDirectory = join(this.dataDirectory, 'runtime');
    this.statePath = join(this.dataDirectory, 'runtime-state.json');
    this.storageDirectory = join(this.dataDirectory, 'data', 'storage');
  }

  versionDirectory(version: string): string {
    return join(this.runtimeDirectory, version);
  }

  async isOwnedDataDirectory(): Promise<boolean> {
    try {
      return (await readFile(this.ownershipPath, 'utf8')) === OWNERSHIP_CONTENTS;
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async ensureOwnedDataDirectory(): Promise<void> {
    if (await this.isOwnedDataDirectory()) return;
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.dataDirectory);
    const unexpectedEntries = entries.filter(
      (entry) => entry !== 'config.json' && entry !== OWNERSHIP_FILE,
    );
    if (unexpectedEntries.length > 0) {
      throw new Error(`Refusing to use non-empty unowned data directory: ${this.dataDirectory}`);
    }
    try {
      await writeFile(this.ownershipPath, OWNERSHIP_CONTENTS, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!isRecord(error) || error.code !== 'EEXIST') throw error;
    }
    if (!(await this.isOwnedDataDirectory())) {
      throw new Error(`Invalid Draftila data ownership marker: ${this.ownershipPath}`);
    }
    await chmod(this.ownershipPath, 0o600);
  }

  async assertSafePurgeTarget(): Promise<void> {
    const workingDirectory = resolve(process.cwd());
    const relativeWorkingDirectory = relative(this.dataDirectory, workingDirectory);
    const containsWorkingDirectory =
      relativeWorkingDirectory === '' ||
      (!relativeWorkingDirectory.startsWith('..') && !relativeWorkingDirectory.includes(':'));
    const unsafeTemporaryDirectories = new Set([
      resolve(tmpdir()),
      resolve('/tmp'),
      resolve('/var/tmp'),
    ]);
    if (
      dirname(this.dataDirectory) === this.dataDirectory ||
      this.dataDirectory === resolve(homedir()) ||
      unsafeTemporaryDirectories.has(this.dataDirectory) ||
      containsWorkingDirectory
    ) {
      throw new Error(`Refusing to purge unsafe data directory: ${this.dataDirectory}`);
    }
    if (!(await this.isOwnedDataDirectory())) {
      throw new Error(`Refusing to purge unowned data directory: ${this.dataDirectory}`);
    }
  }
}
