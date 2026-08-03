#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { DraftilaCli } from './app.js';
import { ConfigStore } from './config.js';
import { DockerClient } from './docker.js';
import { NodeProcessRunner } from './process-runner.js';
import { InquirerPromptService } from './prompts.js';
import { DraftilaTui } from './tui.js';

function getPackageVersion(): string {
  const value: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    typeof value.version !== 'string'
  ) {
    throw new Error('Unable to determine the Draftila CLI version');
  }
  return value.version;
}

export async function main(args = process.argv): Promise<void> {
  const version = getPackageVersion();
  const image = process.env.DRAFTILA_IMAGE ?? `draftila/draftila:${version}`;
  const configStore = new ConfigStore();
  const docker = new DockerClient(new NodeProcessRunner(), image);
  const tui = new DraftilaTui(new InquirerPromptService());
  const cli = new DraftilaCli(configStore, docker, tui);
  const program = new Command();

  program.name('draftila').description('Run and manage Draftila locally').version(version);
  program
    .command('start')
    .description('Start Draftila')
    .action(() => cli.start());
  program
    .command('stop')
    .description('Stop Draftila')
    .action(() => cli.stop());
  program
    .command('restart')
    .description('Restart Draftila')
    .action(() => cli.restart());
  program
    .command('status')
    .description('Show Draftila status')
    .action(() => cli.status());
  program
    .command('config')
    .description('Configure Draftila')
    .action(() => cli.configure());
  program
    .command('uninstall')
    .description('Remove Draftila while preserving data by default')
    .option('--purge', 'permanently remove all projects, files, and configuration')
    .option('-y, --yes', 'skip the uninstall confirmation')
    .action((options: { purge?: boolean; yes?: boolean }) =>
      cli.uninstall({ purge: options.purge ?? false, yes: options.yes ?? false }),
    );

  await program.parseAsync(args);
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('\nCancelled.');
    process.exitCode = 0;
    return;
  }
  console.error(error instanceof Error ? error.message : 'Draftila command failed');
  process.exitCode = 1;
});
