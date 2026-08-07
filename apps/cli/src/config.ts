import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CONFIG_VERSION = 1;

export interface DraftilaConfig {
  version: typeof CONFIG_VERSION;
  bindAddress: '127.0.0.1' | '0.0.0.0';
  port: number;
  publicHostname: string;
  authSecret: string;
}

export interface EditableConfig {
  bindAddress: DraftilaConfig['bindAddress'];
  port: number;
  publicHostname: string;
}

export function getDefaultConfigDirectory(environment = process.env): string {
  if (environment.DRAFTILA_CONFIG_DIR) {
    return environment.DRAFTILA_CONFIG_DIR;
  }
  if (process.platform === 'win32') {
    return join(environment.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Draftila');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Draftila');
  }
  return join(environment.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'draftila');
}

export function createDefaultConfig(): DraftilaConfig {
  return {
    version: CONFIG_VERSION,
    bindAddress: '127.0.0.1',
    port: 3001,
    publicHostname: 'localhost',
    authSecret: randomBytes(32).toString('base64url'),
  };
}

export function buildOrigin(config: EditableConfig): string {
  const hostname = config.publicHostname.includes(':')
    ? `[${config.publicHostname.replace(/^\[|\]$/g, '')}]`
    : config.publicHostname;
  return `http://${hostname}:${config.port}`;
}

export function validatePort(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return 'Port must be an integer between 1 and 65535';
  }
  return null;
}

export function validatePublicHostname(value: string): string | null {
  const hostname = value.trim();
  if (!hostname) return 'Enter a hostname or IP address';
  if (/[/@\s]/.test(hostname) || hostname.includes('://')) {
    return 'Enter only a hostname or IP address';
  }
  try {
    const parsed = new URL(
      `http://${hostname.includes(':') ? `[${hostname.replace(/^\[|\]$/g, '')}]` : hostname}`,
    );
    if (!parsed.hostname) return 'Enter a valid hostname or IP address';
  } catch {
    return 'Enter a valid hostname or IP address';
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseConfig(value: unknown): DraftilaConfig {
  if (!isRecord(value)) throw new Error('Configuration must be a JSON object');
  if (value.version !== CONFIG_VERSION) throw new Error('Unsupported configuration version');
  if (value.bindAddress !== '127.0.0.1' && value.bindAddress !== '0.0.0.0') {
    throw new Error('Invalid binding address');
  }
  if (typeof value.port !== 'number' || validatePort(value.port)) {
    throw new Error('Invalid port');
  }
  if (typeof value.publicHostname !== 'string' || validatePublicHostname(value.publicHostname)) {
    throw new Error('Invalid public hostname');
  }
  if (typeof value.authSecret !== 'string' || value.authSecret.length < 32) {
    throw new Error('Invalid authentication secret');
  }
  return {
    version: CONFIG_VERSION,
    bindAddress: value.bindAddress,
    port: value.port,
    publicHostname: value.publicHostname,
    authSecret: value.authSecret,
  };
}

export class ConfigStore {
  readonly filePath: string;

  constructor(directory = getDefaultConfigDirectory()) {
    this.filePath = join(directory, 'config.json');
  }

  async load(): Promise<DraftilaConfig | null> {
    try {
      return parseConfig(JSON.parse(await readFile(this.filePath, 'utf8')) as unknown);
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${this.filePath}`);
      }
      throw error;
    }
  }

  async save(config: DraftilaConfig): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.filePath);
  }

  async remove(): Promise<void> {
    await rm(this.filePath, { force: true });
    try {
      await rmdir(dirname(this.filePath));
    } catch (error) {
      if (!isRecord(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY')) throw error;
    }
  }
}
