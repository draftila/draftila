import { describe, expect, test } from 'bun:test';
import { DraftilaCli } from '../src/app';
import { ConfigStore, createDefaultConfig } from '../src/config';
import type { RuntimeController, RuntimeInspection } from '../src/runtime-manager';
import type { PromptChoice, PromptService } from '../src/prompts';
import { DraftilaTui } from '../src/tui';

class FakeRuntime implements RuntimeController {
  readonly version = '0.6.1';
  exclusive = false;

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.exclusive = true;
    try {
      return await operation();
    } finally {
      this.exclusive = false;
    }
  }

  getConfigHash(): string {
    return 'hash';
  }

  async inspect(): Promise<RuntimeInspection> {
    return { status: 'running', configHash: 'hash', version: this.version };
  }

  async start(): Promise<'running'> {
    return 'running';
  }

  async stop(): Promise<'stopped'> {
    return 'stopped';
  }

  async restart(): Promise<void> {}

  async runAdminCommand(): Promise<string> {
    return '[{"id":"1","email":"admin@example.com","name":"Admin"}]';
  }

  async uninstall(): Promise<void> {}

  async purge(): Promise<void> {}
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

class PurgePrompts extends UnusedPrompts {
  override async input(): Promise<string> {
    return 'DELETE';
  }
}

describe('status command', () => {
  test('reports the native runtime version', async () => {
    const config = createDefaultConfig();
    const runtime = new FakeRuntime();
    const store = {
      filePath: '/config.json',
      load: async () => {
        expect(runtime.exclusive).toBe(true);
        return config;
      },
      save: async () => {},
      remove: async () => {},
    } as ConfigStore;
    const lines: string[] = [];
    const output = { log: (message: string) => lines.push(message) };
    const cli = new DraftilaCli(
      store,
      runtime,
      new DraftilaTui(new UnusedPrompts(), output),
      output,
    );

    await cli.status();
    expect(lines).toContain('Draftila is running.');
    expect(lines).toContain('Runtime: 0.6.1');
  });

  test('keeps purge configuration removal inside the command lock', async () => {
    const runtime = new FakeRuntime();
    let removed = false;
    const store = {
      filePath: '/config.json',
      load: async () => createDefaultConfig(),
      save: async () => {},
      remove: async () => {
        expect(runtime.exclusive).toBe(true);
        removed = true;
      },
    } as ConfigStore;
    const cli = new DraftilaCli(store, runtime, new DraftilaTui(new PurgePrompts()), {
      log: () => {},
    });

    await cli.uninstall({ purge: true, yes: true });

    expect(removed).toBe(true);
  });
});
