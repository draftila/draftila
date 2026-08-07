import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
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

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === 'string')
    throw new Error('Unable to reserve a smoke test port');
  return address.port;
}

async function run(args: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  const process = Bun.spawn([executablePath, ...args], {
    cwd: runtimeDirectory,
    env: environment,
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

async function fetchWithTimeout(url: string | URL, timeoutMs: number): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
}

function isMatchingHealth(value: unknown, instanceId: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'instanceId' in value &&
    value.instanceId === instanceId
  );
}

async function waitForHealthyRuntime(
  process: Bun.Subprocess,
  origin: string,
  instanceId: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Runtime server exited with code ${process.exitCode}`);
    }
    try {
      const response = await fetchWithTimeout(
        `${origin}/api/health`,
        Math.min(1_000, deadline - Date.now()),
      );
      const value: unknown = await response.json();
      if (response.ok && isMatchingHealth(value, instanceId)) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error('Runtime server did not become healthy');
}

function requireAssetPath(html: string, pattern: RegExp, assetType: string): string {
  const path = html.match(pattern)?.[1];
  if (!path) throw new Error(`Runtime page does not reference a ${assetType} asset`);
  return path;
}

async function verifyWebApplication(
  environment: NodeJS.ProcessEnv,
  origin: string,
  instanceId: string,
): Promise<void> {
  const process = Bun.spawn([executablePath, 'serve', '--instance-id', instanceId], {
    cwd: runtimeDirectory,
    env: environment,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(process.stdout).text();
  const stderr = new Response(process.stderr).text();
  try {
    await waitForHealthyRuntime(process, origin, instanceId);
    const page = await fetchWithTimeout(`${origin}/`, 5_000);
    if (!page.ok) throw new Error(`Runtime page returned status ${page.status}`);
    if (!page.headers.get('content-type')?.startsWith('text/html')) {
      throw new Error('Runtime page has an invalid content type');
    }
    const html = await page.text();
    const scriptPath = requireAssetPath(html, /src="([^"]+\.js)"/, 'JavaScript');
    const stylesheetPath = requireAssetPath(html, /href="([^"]+\.css)"/, 'stylesheet');
    const [script, stylesheet] = await Promise.all([
      fetchWithTimeout(new URL(scriptPath, page.url), 5_000),
      fetchWithTimeout(new URL(stylesheetPath, page.url), 5_000),
    ]);
    if (!script.ok) throw new Error(`Runtime JavaScript returned status ${script.status}`);
    if (!stylesheet.ok) throw new Error(`Runtime stylesheet returned status ${stylesheet.status}`);
    if (!script.headers.get('content-type')?.startsWith('text/javascript')) {
      throw new Error('Runtime JavaScript has an invalid content type');
    }
    if (!stylesheet.headers.get('content-type')?.startsWith('text/css')) {
      throw new Error('Runtime stylesheet has an invalid content type');
    }
  } finally {
    if (process.exitCode === null) process.kill();
    await process.exited;
    await Promise.all([stdout, stderr]);
  }
}

const dataDirectory = await mkdtemp(join(tmpdir(), 'draftila-runtime-smoke-'));
try {
  const instanceId = 'draftila-runtime-smoke';
  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const runtimeEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
    DB_DRIVER: 'sqlite',
    DATABASE_URL: `file:${join(dataDirectory, 'draftila.sqlite')}`,
    BETTER_AUTH_SECRET: 'draftila-runtime-smoke-secret-32-characters',
    BETTER_AUTH_URL: origin,
    FRONTEND_URL: origin,
    HOST: '127.0.0.1',
    PORT: String(port),
    STORAGE_DRIVER: 'local',
    STORAGE_PATH: join(dataDirectory, 'storage'),
    WEB_DIST_DIR: join(runtimeDirectory, 'web'),
    PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath,
    DRAFTILA_RUNTIME_INSTANCE_ID: instanceId,
  };
  if ((await run(['version'], runtimeEnvironment)) !== values.version) {
    throw new Error('The runtime version does not match the requested version');
  }
  await run(['migrate'], runtimeEnvironment);
  await run(['check'], runtimeEnvironment);
  if ((await run(['admin', 'list'], runtimeEnvironment)) !== '[]') {
    throw new Error('The runtime administrator smoke test returned unexpected data');
  }
  await verifyWebApplication(runtimeEnvironment, origin, instanceId);
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
