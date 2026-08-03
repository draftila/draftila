import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'runtime-dir': { type: 'string' },
    version: { type: 'string' },
  },
});

if (!values['runtime-dir']) throw new Error('Missing required argument: --runtime-dir');
if (!values.version) throw new Error('Missing required argument: --version');

const runtimeDirectory = resolve(values['runtime-dir']);
const executableName = process.platform === 'win32' ? 'draftila-runtime.exe' : 'draftila-runtime';
const executablePath = join(runtimeDirectory, executableName);
const queryEnginePath = join(runtimeDirectory, 'prisma-query-engine.node');
if (!(await stat(queryEnginePath)).isFile()) {
  throw new Error('The packaged Prisma query engine is missing');
}
const dataDirectory = await mkdtemp(join(tmpdir(), 'draftila-runtime-smoke-'));
const runtimeEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  DB_DRIVER: 'sqlite',
  DATABASE_URL: `file:${join(dataDirectory, 'draftila.sqlite')}`,
  BETTER_AUTH_SECRET: 'draftila-runtime-smoke-secret-32-characters',
  BETTER_AUTH_URL: 'http://127.0.0.1:4173',
  FRONTEND_URL: 'http://127.0.0.1:4173',
  HOST: '127.0.0.1',
  PORT: '4173',
  STORAGE_DRIVER: 'local',
  STORAGE_PATH: join(dataDirectory, 'storage'),
  WEB_DIST_DIR: join(runtimeDirectory, 'web'),
  PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath,
};

async function run(args: string[]): Promise<string> {
  const process = Bun.spawn([executablePath, ...args], {
    cwd: runtimeDirectory,
    env: runtimeEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `Runtime exited with code ${exitCode}`);
  return stdout.trim();
}

try {
  if ((await run(['version'])) !== values.version) {
    throw new Error('The runtime version does not match the requested version');
  }
  await run(['migrate']);
  await run(['check']);
  if ((await run(['admin', 'list'])) !== '[]') {
    throw new Error('The runtime administrator smoke test returned unexpected data');
  }
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
