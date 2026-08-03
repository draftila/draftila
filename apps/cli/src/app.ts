import { buildOrigin, ConfigStore, createDefaultConfig, type DraftilaConfig } from './config.js';
import type { RuntimeController } from './runtime-manager.js';
import { DraftilaTui } from './tui.js';

export interface UninstallOptions {
  purge: boolean;
  yes: boolean;
}

export class DraftilaCli {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly runtime: RuntimeController,
    private readonly tui: DraftilaTui,
    private readonly output: Pick<Console, 'log'> = console,
  ) {}

  async start(): Promise<void> {
    await this.runtime.runExclusive(() => this.startUnlocked());
  }

  async stop(): Promise<void> {
    await this.runtime.runExclusive(() => this.stopUnlocked());
  }

  async restart(): Promise<void> {
    await this.runtime.runExclusive(() => this.restartUnlocked());
  }

  async status(): Promise<void> {
    await this.runtime.runExclusive(() => this.statusUnlocked());
  }

  async configure(): Promise<void> {
    await this.runtime.runExclusive(() => this.configureUnlocked());
  }

  async uninstall(options: UninstallOptions): Promise<void> {
    await this.runtime.runExclusive(() => this.uninstallUnlocked(options));
  }

  private async startUnlocked(): Promise<void> {
    const config = await this.getOrCreateConfig();
    if (!config) return;
    this.output.log(`Starting Draftila ${this.runtime.version}...`);
    const result = await this.runtime.start(config);
    this.output.log(
      result === 'running'
        ? `Draftila is already running at ${buildOrigin(config)}.`
        : `Draftila is running at ${buildOrigin(config)}.`,
    );
    const administrators = await this.runtime.runAdminCommand(['list']);
    if (this.isEmptyJsonArray(administrators)) {
      const configureAdmin = await this.tui.confirm('Create an administrator now?', true);
      if (configureAdmin) await this.tui.manageAdministrators(this.runtime);
    }
  }

  private async stopUnlocked(): Promise<void> {
    const status = await this.runtime.stop();
    if (status === 'not-installed') this.output.log('Draftila is not installed.');
    else if (status === 'stopped') this.output.log('Draftila is stopped.');
  }

  private async restartUnlocked(): Promise<void> {
    const config = await this.getOrCreateConfig();
    if (!config) return;
    this.output.log('Restarting Draftila...');
    await this.runtime.restart(config);
    this.output.log(`Draftila is running at ${buildOrigin(config)}.`);
  }

  private async statusUnlocked(): Promise<void> {
    const inspection = await this.runtime.inspect();
    const config = await this.configStore.load();
    if (inspection.status === 'not-installed') {
      this.output.log('Draftila is not installed. Run `npx draftila start` to get started.');
      return;
    }
    this.output.log(`Draftila is ${inspection.status}.`);
    if (config) this.output.log(`Address: ${buildOrigin(config)}`);
    if (inspection.version) this.output.log(`Runtime: ${inspection.version}`);
  }

  private async configureUnlocked(): Promise<void> {
    const current = (await this.configStore.load()) ?? createDefaultConfig();
    const config = await this.tui.configure(current);
    if (!config) {
      this.output.log('Configuration was not changed.');
      return;
    }
    await this.configStore.save(config);
    this.output.log(`Configuration saved to ${this.configStore.filePath}.`);
    const inspection = await this.runtime.inspect();
    if (inspection.status === 'not-installed') {
      this.output.log('Start Draftila to manage administrator users.');
      return;
    }
    if (
      (inspection.status === 'running' || inspection.status === 'unhealthy') &&
      inspection.configHash !== this.runtime.getConfigHash(config)
    ) {
      const apply = await this.tui.confirm('Restart Draftila to apply these changes?', true);
      if (!apply) {
        this.output.log('The new settings will be applied on the next start.');
        return;
      }
      await this.runtime.start(config);
      this.output.log(`Draftila restarted at ${buildOrigin(config)}.`);
    }
    await this.tui.manageAdministrators(this.runtime);
  }

  private async uninstallUnlocked(options: UninstallOptions): Promise<void> {
    if (!options.yes) {
      const confirmed = await this.tui.confirm(
        options.purge
          ? 'Uninstall Draftila and permanently delete all projects and files?'
          : 'Uninstall Draftila? Projects and files will be preserved.',
      );
      if (!confirmed) {
        this.output.log('Uninstall cancelled.');
        return;
      }
    }
    if (options.purge && !(await this.tui.confirmPurge())) {
      this.output.log('Permanent deletion cancelled.');
      return;
    }
    if (options.purge) {
      await this.runtime.purge();
      await this.configStore.remove();
      this.output.log('Draftila and all local data were permanently removed.');
      return;
    }
    await this.runtime.uninstall();
    this.output.log('Draftila was uninstalled. Projects, files, and configuration were preserved.');
  }

  private async getOrCreateConfig(): Promise<DraftilaConfig | null> {
    const existing = await this.configStore.load();
    if (existing) return existing;
    const config = await this.tui.configure(createDefaultConfig());
    if (!config) {
      this.output.log('Setup cancelled.');
      return null;
    }
    await this.configStore.save(config);
    return config;
  }

  private isEmptyJsonArray(output: string): boolean {
    const line = output
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .at(-1);
    if (!line) return false;
    try {
      const value: unknown = JSON.parse(line);
      return Array.isArray(value) && value.length === 0;
    } catch {
      return false;
    }
  }
}
