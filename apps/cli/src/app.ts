import { buildOrigin, ConfigStore, createDefaultConfig, type DraftilaConfig } from './config.js';
import { DockerClient, DockerUnavailableError, type ContainerStatus } from './docker.js';
import { DraftilaTui } from './tui.js';

export interface UninstallOptions {
  purge: boolean;
  yes: boolean;
}

export class DraftilaCli {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly docker: DockerClient,
    private readonly tui: DraftilaTui,
    private readonly output: Pick<Console, 'log'> = console,
  ) {}

  async start(): Promise<void> {
    const config = await this.getOrCreateConfig();
    if (!config) return;
    await this.docker.ensureAvailable();
    this.output.log(`Starting Draftila with ${this.docker.image}...`);
    const result = await this.docker.start(config);
    await this.docker.waitUntilHealthy(config.port);
    this.output.log(
      result === 'running'
        ? `Draftila is already running at ${buildOrigin(config)}.`
        : `Draftila is running at ${buildOrigin(config)}.`,
    );
    const administrators = await this.docker.runAdminCommand(['list']);
    if (this.isEmptyJsonArray(administrators)) {
      const configureAdmin = await this.tui.confirm('Create an administrator now?', true);
      if (configureAdmin) await this.tui.manageAdministrators(this.docker);
    }
  }

  async stop(): Promise<void> {
    await this.docker.ensureAvailable();
    const status = await this.docker.stop();
    if (status === 'not-installed') this.output.log('Draftila is not installed.');
    else if (status === 'stopped') this.output.log('Draftila is stopped.');
  }

  async restart(): Promise<void> {
    const config = await this.getOrCreateConfig();
    if (!config) return;
    await this.docker.ensureAvailable();
    this.output.log('Restarting Draftila...');
    await this.docker.restart(config);
    await this.docker.waitUntilHealthy(config.port);
    this.output.log(`Draftila is running at ${buildOrigin(config)}.`);
  }

  async status(): Promise<void> {
    await this.docker.ensureAvailable();
    const inspection = await this.docker.inspectContainer();
    const config = await this.configStore.load();
    if (inspection.status === 'not-installed') {
      this.output.log('Draftila is not installed. Run `npx draftila start` to get started.');
      return;
    }
    this.output.log(`Draftila is ${inspection.status}.`);
    if (config) this.output.log(`Address: ${buildOrigin(config)}`);
    if (inspection.image) this.output.log(`Image: ${inspection.image}`);
  }

  async configure(): Promise<void> {
    const current = (await this.configStore.load()) ?? createDefaultConfig();
    const config = await this.tui.configure(current);
    if (!config) {
      this.output.log('Configuration was not changed.');
      return;
    }
    await this.configStore.save(config);
    this.output.log(`Configuration saved to ${this.configStore.filePath}.`);
    let status: ContainerStatus;
    try {
      await this.docker.ensureAvailable();
      status = (await this.docker.inspectContainer()).status;
    } catch (error) {
      if (error instanceof DockerUnavailableError) {
        this.output.log('Start Docker to run Draftila and manage administrator users.');
        return;
      }
      throw error;
    }
    if (status !== 'running') {
      this.output.log('Start Draftila to manage administrator users.');
      return;
    }
    const inspection = await this.docker.inspectContainer();
    if (inspection.configHash !== this.docker.getConfigHash(config)) {
      const apply = await this.tui.confirm('Restart Draftila to apply these changes?', true);
      if (!apply) {
        this.output.log('The new settings will be applied on the next start.');
        return;
      }
      await this.docker.start(config);
      await this.docker.waitUntilHealthy(config.port);
      this.output.log(`Draftila restarted at ${buildOrigin(config)}.`);
    }
    await this.tui.manageAdministrators(this.docker);
  }

  async uninstall(options: UninstallOptions): Promise<void> {
    await this.docker.ensureAvailable();
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
    await this.docker.removeContainer();
    await this.docker.removeImage();
    if (options.purge) {
      await this.docker.removeDataVolume();
      await this.configStore.remove();
      this.output.log('Draftila and all local data were permanently removed.');
      return;
    }
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
