import { networkInterfaces } from 'node:os';
import {
  CONFIG_VERSION,
  type DraftilaConfig,
  validatePort,
  validatePublicHostname,
} from './config.js';
import type { DockerClient } from './docker.js';
import type { PromptService } from './prompts.js';

interface AdminAccount {
  id: string;
  email: string;
  name: string;
}

interface AccountInspection extends AdminAccount {
  role: 'admin' | 'user';
}

type AdminAction = 'add' | 'reset-password' | 'demote' | 'done';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonLine(value: string): unknown {
  const line = value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) throw new Error('Administrator command returned no data');
  return JSON.parse(line) as unknown;
}

function parseAdmin(value: unknown): AdminAccount {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.name !== 'string'
  ) {
    throw new Error('Administrator command returned invalid data');
  }
  return { id: value.id, email: value.email, name: value.name };
}

function parseAdmins(output: string): AdminAccount[] {
  const value = parseJsonLine(output);
  if (!Array.isArray(value)) throw new Error('Administrator command returned invalid data');
  return value.map(parseAdmin);
}

function parseInspection(output: string): AccountInspection | null {
  const value = parseJsonLine(output);
  if (value === null) return null;
  const account = parseAdmin(value);
  if (!isRecord(value) || (value.role !== 'admin' && value.role !== 'user')) {
    throw new Error('Administrator command returned invalid data');
  }
  return { ...account, role: value.role };
}

function findDefaultNetworkHostname(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return 'draftila.local';
}

function validateEmail(value: string): boolean | string {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || 'Enter a valid email address';
}

function validatePassword(value: string): boolean | string {
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (value.length > 128) return 'Password must be at most 128 characters';
  return true;
}

export class DraftilaTui {
  constructor(
    private readonly prompts: PromptService,
    private readonly output: Pick<Console, 'log'> = console,
  ) {}

  async configure(current: DraftilaConfig): Promise<DraftilaConfig | null> {
    this.output.log('\nDraftila configuration\n');
    const bindAddress = await this.prompts.select(
      'Who can reach Draftila?',
      [
        {
          name: 'Only this computer',
          value: '127.0.0.1' as const,
          description: 'Bind to localhost',
        },
        {
          name: 'Devices on my local network',
          value: '0.0.0.0' as const,
          description: 'Bind to all network interfaces',
        },
      ],
      current.bindAddress,
    );
    const portText = await this.prompts.input('Port', {
      defaultValue: String(current.port),
      validate: (value) => validatePort(Number(value.trim())) ?? true,
    });
    const port = Number(portText.trim());
    const publicHostname =
      bindAddress === '127.0.0.1'
        ? 'localhost'
        : (
            await this.prompts.input('Hostname or IP that other devices will use', {
              defaultValue:
                current.bindAddress === '0.0.0.0'
                  ? current.publicHostname
                  : findDefaultNetworkHostname(),
              validate: (value) => validatePublicHostname(value) ?? true,
            })
          ).trim();
    const config = {
      version: CONFIG_VERSION,
      bindAddress,
      port,
      publicHostname,
      authSecret: current.authSecret,
    } satisfies DraftilaConfig;
    const save = await this.prompts.confirm('Save this configuration?', true);
    return save ? config : null;
  }

  async manageAdministrators(docker: DockerClient): Promise<void> {
    while (true) {
      const administrators = parseAdmins(await docker.runAdminCommand(['list']));
      this.output.log('\nAdministrator users');
      if (administrators.length === 0) this.output.log('  No administrators configured');
      else
        administrators.forEach((account) =>
          this.output.log(`  ${account.name} <${account.email}>`),
        );
      const action = await this.prompts.select<AdminAction>('Choose an action', [
        { name: 'Add administrator', value: 'add' },
        {
          name: 'Reset administrator password',
          value: 'reset-password',
          disabled: administrators.length === 0 ? 'No administrators configured' : false,
        },
        {
          name: 'Remove administrator access',
          value: 'demote',
          disabled: administrators.length <= 1 ? 'At least one administrator is required' : false,
        },
        { name: 'Done', value: 'done' },
      ]);
      if (action === 'done') return;
      if (action === 'add') await this.addAdministrator(docker);
      if (action === 'reset-password')
        await this.resetAdministratorPassword(docker, administrators);
      if (action === 'demote') await this.demoteAdministrator(docker, administrators);
    }
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    return this.prompts.confirm(message, defaultValue);
  }

  async confirmPurge(): Promise<boolean> {
    const confirmation = await this.prompts.input('Type DELETE to permanently remove all data');
    return confirmation === 'DELETE';
  }

  private async addAdministrator(docker: DockerClient): Promise<void> {
    const email = (await this.prompts.input('Email address', { validate: validateEmail }))
      .trim()
      .toLowerCase();
    const inspection = parseInspection(await docker.runAdminCommand(['inspect', '--email', email]));
    if (inspection?.role === 'admin') {
      this.output.log(`${email} is already an administrator.`);
      return;
    }
    if (inspection?.role === 'user') {
      const promote = await this.prompts.confirm(`Promote ${email} to administrator?`, true);
      if (!promote) return;
      await docker.runAdminCommand(['promote', '--email', email]);
      this.output.log(`Administrator access added for ${email}.`);
      return;
    }
    const name = (
      await this.prompts.input('Display name', {
        validate: (value) => value.trim().length > 0 || 'Display name is required',
      })
    ).trim();
    const password = await this.askNewPassword();
    await docker.runAdminCommand(
      ['create', '--email', email, '--name', name, '--password-stdin'],
      password,
    );
    this.output.log(`Administrator ${email} created.`);
  }

  private async resetAdministratorPassword(
    docker: DockerClient,
    administrators: AdminAccount[],
  ): Promise<void> {
    const email = await this.chooseAdministrator('Select an administrator', administrators);
    const password = await this.askNewPassword();
    await docker.runAdminCommand(
      ['reset-password', '--email', email, '--password-stdin'],
      password,
    );
    this.output.log(`Password reset for ${email}. Existing sessions were signed out.`);
  }

  private async demoteAdministrator(
    docker: DockerClient,
    administrators: AdminAccount[],
  ): Promise<void> {
    const email = await this.chooseAdministrator(
      'Remove administrator access from',
      administrators,
    );
    const confirmed = await this.prompts.confirm(
      `Remove administrator access from ${email}? The user account and projects will be kept.`,
    );
    if (!confirmed) return;
    await docker.runAdminCommand(['demote', '--email', email]);
    this.output.log(`Administrator access removed from ${email}.`);
  }

  private chooseAdministrator(message: string, administrators: AdminAccount[]): Promise<string> {
    return this.prompts.select(
      message,
      administrators.map((account) => ({
        name: `${account.name} <${account.email}>`,
        value: account.email,
      })),
    );
  }

  private async askNewPassword(): Promise<string> {
    const password = await this.prompts.password('Password', validatePassword);
    await this.prompts.password('Confirm password', (value) =>
      value === password ? true : 'Passwords do not match',
    );
    return password;
  }
}
