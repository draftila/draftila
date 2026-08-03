import { createHash } from 'node:crypto';
import type { DraftilaConfig } from './config.js';
import { buildOrigin } from './config.js';
import type { ProcessRunner } from './process-runner.js';

export const CONTAINER_NAME = 'draftila';
export const DATA_VOLUME_NAME = 'draftila_data';
const CONFIG_HASH_LABEL = 'io.draftila.config-hash';
const MANAGED_LABEL = 'io.draftila.managed';

export type ContainerStatus = 'not-installed' | 'running' | 'stopped';

export interface ContainerInspection {
  status: ContainerStatus;
  configHash: string | null;
  image: string | null;
}

type HealthFetcher = (url: string) => Promise<Response>;

export class DockerCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerCommandError';
  }
}

export class DockerUnavailableError extends DockerCommandError {
  constructor(message: string) {
    super(message);
    this.name = 'DockerUnavailableError';
  }
}

function commandError(action: string, stderr: string): DockerCommandError {
  const detail = stderr.trim();
  return new DockerCommandError(detail ? `${action}: ${detail}` : action);
}

export class DockerClient {
  constructor(
    private readonly runner: ProcessRunner,
    readonly image: string,
    private readonly fetcher: HealthFetcher = fetch,
  ) {}

  async ensureAvailable(): Promise<void> {
    let result;
    try {
      result = await this.runner.run('docker', ['info', '--format', '{{.ServerVersion}}']);
    } catch {
      throw new DockerUnavailableError('Docker is not installed or cannot be started');
    }
    if (result.exitCode !== 0) {
      throw new DockerUnavailableError(
        commandError(
          'Docker is not available. Install and start Docker, then try again',
          result.stderr,
        ).message,
      );
    }
  }

  async inspectContainer(): Promise<ContainerInspection> {
    const result = await this.runner.run('docker', [
      'container',
      'inspect',
      CONTAINER_NAME,
      '--format',
      `{{.State.Status}}|{{index .Config.Labels "${CONFIG_HASH_LABEL}"}}|{{index .Config.Labels "${MANAGED_LABEL}"}}|{{.Config.Image}}`,
    ]);
    if (result.exitCode !== 0) {
      if (/no such (object|container)/i.test(result.stderr)) {
        return { status: 'not-installed', configHash: null, image: null };
      }
      throw commandError('Unable to inspect the Draftila container', result.stderr);
    }
    const [status, configHash, managed, image] = result.stdout.trim().split('|');
    if (managed !== 'true') {
      throw new DockerCommandError(
        `A Docker container named ${CONTAINER_NAME} already exists but is not managed by Draftila`,
      );
    }
    return {
      status: status === 'running' ? 'running' : 'stopped',
      configHash: configHash || null,
      image: image || null,
    };
  }

  getConfigHash(config: DraftilaConfig): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          bindAddress: config.bindAddress,
          port: config.port,
          publicHostname: config.publicHostname,
          authSecret: config.authSecret,
          image: this.image,
        }),
      )
      .digest('hex');
  }

  async ensureImage(): Promise<void> {
    const inspection = await this.runner.run('docker', ['image', 'inspect', this.image]);
    if (inspection.exitCode === 0) return;
    const pull = await this.runner.run('docker', ['pull', this.image]);
    if (pull.exitCode !== 0) throw commandError(`Unable to pull ${this.image}`, pull.stderr);
  }

  async start(config: DraftilaConfig): Promise<'created' | 'recreated' | 'started' | 'running'> {
    const expectedHash = this.getConfigHash(config);
    const inspection = await this.inspectContainer();
    if (inspection.status !== 'not-installed' && inspection.configHash !== expectedHash) {
      await this.removeContainer();
      await this.ensureImage();
      await this.createContainer(config, expectedHash);
      return 'recreated';
    }
    if (inspection.status === 'running') return 'running';
    if (inspection.status === 'stopped') {
      const result = await this.runner.run('docker', ['start', CONTAINER_NAME]);
      if (result.exitCode !== 0) throw commandError('Unable to start Draftila', result.stderr);
      return 'started';
    }
    await this.ensureImage();
    await this.createContainer(config, expectedHash);
    return 'created';
  }

  async stop(): Promise<ContainerStatus> {
    const inspection = await this.inspectContainer();
    if (inspection.status !== 'running') return inspection.status;
    const result = await this.runner.run('docker', ['stop', CONTAINER_NAME]);
    if (result.exitCode !== 0) throw commandError('Unable to stop Draftila', result.stderr);
    return 'stopped';
  }

  async restart(
    config: DraftilaConfig,
  ): Promise<'created' | 'recreated' | 'started' | 'running' | 'restarted'> {
    const inspection = await this.inspectContainer();
    if (
      inspection.status === 'not-installed' ||
      inspection.configHash !== this.getConfigHash(config)
    ) {
      return this.start(config);
    }
    const result = await this.runner.run('docker', ['restart', CONTAINER_NAME]);
    if (result.exitCode !== 0) throw commandError('Unable to restart Draftila', result.stderr);
    return 'restarted';
  }

  async removeContainer(): Promise<void> {
    const inspection = await this.inspectContainer();
    if (inspection.status === 'not-installed') return;
    const result = await this.runner.run('docker', ['rm', '--force', CONTAINER_NAME]);
    if (result.exitCode !== 0)
      throw commandError('Unable to remove the Draftila container', result.stderr);
  }

  async removeImage(): Promise<void> {
    const inspection = await this.runner.run('docker', ['image', 'inspect', this.image]);
    if (inspection.exitCode !== 0) return;
    const result = await this.runner.run('docker', ['image', 'rm', this.image]);
    if (result.exitCode !== 0)
      throw commandError('Unable to remove the Draftila image', result.stderr);
  }

  async removeDataVolume(): Promise<void> {
    if (!(await this.inspectDataVolume())) return;
    const result = await this.runner.run('docker', ['volume', 'rm', DATA_VOLUME_NAME]);
    if (result.exitCode !== 0) throw commandError('Unable to remove Draftila data', result.stderr);
  }

  async runAdminCommand(args: string[], input?: string): Promise<string> {
    const inspection = await this.inspectContainer();
    if (inspection.status !== 'running') {
      throw new DockerCommandError('Draftila must be running to manage administrators');
    }
    const result = await this.runner.run(
      'docker',
      [
        'exec',
        '--interactive',
        CONTAINER_NAME,
        'bun',
        'run',
        '--filter',
        '@draftila/api',
        'db:admin',
        '--',
        ...args,
      ],
      input === undefined ? undefined : { input },
    );
    if (result.exitCode !== 0) throw commandError('Administrator command failed', result.stderr);
    return result.stdout.trim();
  }

  async waitUntilHealthy(port: number, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${port}/api/health`;
    while (Date.now() < deadline) {
      let healthy = false;
      try {
        healthy = (await this.fetcher(url)).ok;
      } catch {
        healthy = false;
      }
      if (healthy) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new DockerCommandError('Draftila did not become healthy within 60 seconds');
  }

  private async createContainer(config: DraftilaConfig, configHash: string): Promise<void> {
    await this.ensureDataVolume();
    const publicOrigin = buildOrigin(config);
    const localOrigin = `http://localhost:${config.port}`;
    const trustedOrigins = [...new Set([publicOrigin, localOrigin])].join(',');
    const args = [
      'run',
      '--detach',
      '--name',
      CONTAINER_NAME,
      '--restart',
      'unless-stopped',
      '--label',
      `${MANAGED_LABEL}=true`,
      '--label',
      `${CONFIG_HASH_LABEL}=${configHash}`,
      '--publish',
      `${config.bindAddress}:${config.port}:3001`,
      '--env',
      'DB_DRIVER=sqlite',
      '--env',
      'DATABASE_URL=file:/app/data/draftila.sqlite',
      '--env',
      `BETTER_AUTH_SECRET=${config.authSecret}`,
      '--env',
      `BETTER_AUTH_URL=${publicOrigin}`,
      '--env',
      `FRONTEND_URL=${publicOrigin}`,
      '--env',
      `FRONTEND_URLS=${trustedOrigins}`,
      '--env',
      'PORT=3001',
      '--env',
      'STORAGE_DRIVER=local',
      '--env',
      'STORAGE_PATH=/app/data/storage',
      '--volume',
      `${DATA_VOLUME_NAME}:/app/data`,
      this.image,
    ];
    const result = await this.runner.run('docker', args);
    if (result.exitCode !== 0)
      throw commandError('Unable to create the Draftila container', result.stderr);
  }

  private async inspectDataVolume(): Promise<boolean> {
    const result = await this.runner.run('docker', [
      'volume',
      'inspect',
      DATA_VOLUME_NAME,
      '--format',
      `{{index .Labels "${MANAGED_LABEL}"}}`,
    ]);
    if (result.exitCode !== 0) {
      if (/no such volume/i.test(result.stderr)) return false;
      throw commandError('Unable to inspect Draftila data', result.stderr);
    }
    if (result.stdout.trim() !== 'true') {
      throw new DockerCommandError(
        `A Docker volume named ${DATA_VOLUME_NAME} already exists but is not managed by Draftila`,
      );
    }
    return true;
  }

  private async ensureDataVolume(): Promise<void> {
    if (await this.inspectDataVolume()) return;
    const result = await this.runner.run('docker', [
      'volume',
      'create',
      '--label',
      `${MANAGED_LABEL}=true`,
      DATA_VOLUME_NAME,
    ]);
    if (result.exitCode !== 0) throw commandError('Unable to create Draftila data', result.stderr);
    await this.inspectDataVolume();
  }
}
