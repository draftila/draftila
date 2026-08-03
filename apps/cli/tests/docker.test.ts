import { describe, expect, test } from 'bun:test';
import { createDefaultConfig } from '../src/config';
import { CONTAINER_NAME, DATA_VOLUME_NAME, DockerClient, DockerCommandError } from '../src/docker';
import type { CommandOptions, CommandResult, ProcessRunner } from '../src/process-runner';

interface RecordedCall {
  command: string;
  args: string[];
  options?: CommandOptions;
}

class FakeRunner implements ProcessRunner {
  readonly calls: RecordedCall[] = [];

  constructor(readonly results: CommandResult[]) {}

  async run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const result = this.results.shift();
    if (!result) throw new Error('No fake result configured');
    return result;
  }
}

const success = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' });
const failure = (stderr: string): CommandResult => ({ exitCode: 1, stdout: '', stderr });

describe('DockerClient', () => {
  test('creates a versioned container with persistent data and restricted binding', async () => {
    const runner = new FakeRunner([
      failure('No such object: draftila'),
      failure('No such image'),
      success('pulled'),
      failure('No such volume'),
      success(DATA_VOLUME_NAME),
      success('true'),
      success('container-id'),
    ]);
    const config = createDefaultConfig();
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    expect(await docker.start(config)).toBe('created');
    const run = runner.calls.at(-1)!;
    expect(run.command).toBe('docker');
    expect(run.args).toContain(`${config.bindAddress}:${config.port}:3001`);
    expect(run.args).toContain(`${DATA_VOLUME_NAME}:/app/data`);
    expect(run.args).toContain('draftila/draftila:0.6.0');
    expect(run.args).toContain(`BETTER_AUTH_SECRET=${config.authSecret}`);
    expect(run.args).toContain('FRONTEND_URLS=http://localhost:3001');
  });

  test('does not recreate a matching running container', async () => {
    const config = createDefaultConfig();
    const runner = new FakeRunner([]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    runner.results.push(
      success(`running|${docker.getConfigHash(config)}|true|draftila/draftila:0.6.0`),
    );
    expect(await docker.start(config)).toBe('running');
    expect(runner.calls).toHaveLength(1);
  });

  test('recreates a container when configuration changed', async () => {
    const runner = new FakeRunner([
      success('running|old-hash|true|draftila/draftila:0.6.0'),
      success('running|old-hash|true|draftila/draftila:0.6.0'),
      success(),
      success(),
      success('true'),
      success(),
    ]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    expect(await docker.start(createDefaultConfig())).toBe('recreated');
    expect(
      runner.calls.some((call) => call.args.join(' ') === `rm --force ${CONTAINER_NAME}`),
    ).toBe(true);
  });

  test('starts and stops an existing container idempotently', async () => {
    const config = createDefaultConfig();
    const startRunner = new FakeRunner([]);
    const docker = new DockerClient(startRunner, 'draftila/draftila:0.6.0');
    startRunner.results.push(
      success(`exited|${docker.getConfigHash(config)}|true|draftila/draftila:0.6.0`),
      success(),
    );
    expect(await docker.start(config)).toBe('started');

    const stopRunner = new FakeRunner([
      success('running|hash|true|draftila/draftila:0.6.0'),
      success(),
    ]);
    expect(await new DockerClient(stopRunner, docker.image).stop()).toBe('stopped');
    const absentRunner = new FakeRunner([failure('No such container')]);
    expect(await new DockerClient(absentRunner, docker.image).stop()).toBe('not-installed');
  });

  test('passes administrator passwords only through stdin', async () => {
    const runner = new FakeRunner([
      success('running|hash|true|draftila/draftila:0.6.0'),
      success('{}'),
    ]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    const password = 'secret password';
    await docker.runAdminCommand(['reset-password', '--email', 'admin@example.com'], password);
    const call = runner.calls[1]!;
    expect(call.args.join(' ')).not.toContain(password);
    expect(call.options?.input).toBe(password);
    expect(call.args).toContain('--interactive');
  });

  test('requires a running container for administrator commands', async () => {
    const runner = new FakeRunner([success('exited|hash|true|draftila/draftila:0.6.0')]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    await expect(docker.runAdminCommand(['list'])).rejects.toThrow('must be running');
  });

  test('removes container, image, and data when present', async () => {
    const runner = new FakeRunner([
      success('running|hash|true|draftila/draftila:0.6.0'),
      success(),
      success(),
      success(),
      success('true'),
      success(),
    ]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    await docker.removeContainer();
    await docker.removeImage();
    await docker.removeDataVolume();
    expect(runner.calls.at(-1)?.args).toEqual(['volume', 'rm', DATA_VOLUME_NAME]);
  });

  test('reports Docker availability failures clearly', async () => {
    const runner = new FakeRunner([failure('daemon unavailable')]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    await expect(docker.ensureAvailable()).rejects.toBeInstanceOf(DockerCommandError);
    await expect(
      new DockerClient(
        {
          run: async () => {
            throw new Error('spawn ENOENT');
          },
        },
        docker.image,
      ).ensureAvailable(),
    ).rejects.toThrow('not installed');
  });

  test('refuses to operate on unmanaged containers and volumes', async () => {
    const containerRunner = new FakeRunner([success('running|hash|false|unrelated/image:latest')]);
    await expect(
      new DockerClient(containerRunner, 'draftila/draftila:0.6.0').stop(),
    ).rejects.toThrow('not managed by Draftila');

    const volumeRunner = new FakeRunner([success('false')]);
    await expect(
      new DockerClient(volumeRunner, 'draftila/draftila:0.6.0').removeDataVolume(),
    ).rejects.toThrow('not managed by Draftila');
  });

  test('returns the image used by the installed container', async () => {
    const runner = new FakeRunner([success('running|hash|true|draftila/draftila:0.5.0')]);
    const inspection = await new DockerClient(runner, 'draftila/draftila:0.6.0').inspectContainer();
    expect(inspection.image).toBe('draftila/draftila:0.5.0');
  });

  test('waits for the health endpoint', async () => {
    const urls: string[] = [];
    const docker = new DockerClient(
      new FakeRunner([]),
      'draftila/draftila:0.6.0',
      async (input) => {
        urls.push(String(input));
        return new Response('{}', { status: 200 });
      },
    );
    await docker.waitUntilHealthy(4567, 10);
    expect(urls).toEqual(['http://127.0.0.1:4567/api/health']);
  });
});
