import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DraftilaCli } from '../src/app';
import { ConfigStore } from '../src/config';
import { DockerClient } from '../src/docker';
import type { CommandResult, ProcessRunner } from '../src/process-runner';
import type { PromptChoice, PromptService } from '../src/prompts';
import { DraftilaTui } from '../src/tui';

class FakeRunner implements ProcessRunner {
  constructor(private readonly results: CommandResult[]) {}

  async run(): Promise<CommandResult> {
    const result = this.results.shift();
    if (!result) throw new Error('No fake result configured');
    return result;
  }
}

class UnusedPrompts implements PromptService {
  async confirm(): Promise<boolean> {
    throw new Error('Prompt was not expected');
  }

  async input(): Promise<string> {
    throw new Error('Prompt was not expected');
  }

  async password(): Promise<string> {
    throw new Error('Prompt was not expected');
  }

  async select<Value>(_message: string, _choices: PromptChoice<Value>[]): Promise<Value> {
    throw new Error('Prompt was not expected');
  }
}

const stores: ConfigStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.remove()));
});

describe('status command', () => {
  test('reports the image used by the installed container', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftila-app-test-'));
    const store = new ConfigStore(directory);
    stores.push(store);
    const runner = new FakeRunner([
      { exitCode: 0, stdout: '27.0.0', stderr: '' },
      {
        exitCode: 0,
        stdout: 'running|hash|true|draftila/draftila:0.5.0',
        stderr: '',
      },
    ]);
    const docker = new DockerClient(runner, 'draftila/draftila:0.6.0');
    const lines: string[] = [];
    const output = { log: (message: string) => lines.push(message) };
    const cli = new DraftilaCli(
      store,
      docker,
      new DraftilaTui(new UnusedPrompts(), output),
      output,
    );
    await cli.status();
    expect(lines).toContain('Image: draftila/draftila:0.5.0');
    expect(lines).not.toContain('Image: draftila/draftila:0.6.0');
  });
});
