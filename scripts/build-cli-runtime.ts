import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    version: { type: 'string' },
    outdir: { type: 'string' },
    target: { type: 'string' },
  },
});

if (!values.version) throw new Error('Missing required argument: --version');
if (!values.outdir) throw new Error('Missing required argument: --outdir');

const supportedTargets = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64',
]);
const target = `${process.platform}-${process.arch}`;
if (!supportedTargets.has(target)) throw new Error(`Unsupported runtime target: ${target}`);
if (values.target && values.target !== target) {
  throw new Error(`Expected runtime target ${values.target}, received ${target}`);
}

const repositoryRoot = resolve(import.meta.dir, '..');
const outputDirectory = resolve(repositoryRoot, values.outdir);
const executableName = process.platform === 'win32' ? 'draftila-runtime.exe' : 'draftila-runtime';
const executablePath = join(outputDirectory, executableName);
const queryEngineName = 'prisma-query-engine.node';
const queryEngineDirectory = join(repositoryRoot, 'apps/api/src/generated/prisma/sqlite-client');
const queryEngineEntries = (await readdir(queryEngineDirectory)).filter((entry) =>
  /^(?:lib)?query_engine.+\.node$/.test(entry),
);
if (queryEngineEntries.length !== 1) {
  throw new Error(`Expected one generated SQLite query engine, found ${queryEngineEntries.length}`);
}
const queryEngineSourcePath = join(queryEngineDirectory, queryEngineEntries[0]!);
const embeddedDependencyDataPlugin: Bun.BunPlugin = {
  name: 'embedded-dependency-data',
  setup(builder) {
    builder.onLoad({ filter: /css-tree[/\\]lib[/\\](data|version)\.js$/ }, async ({ path }) => ({
      contents: await readFile(join(dirname(path), '..', 'dist', basename(path)), 'utf8'),
      loader: 'js',
    }));
    builder.onLoad({ filter: /csso[/\\]lib[/\\]version\.js$/ }, async ({ path }) => ({
      contents: await readFile(join(dirname(path), '..', 'dist', 'version.js'), 'utf8'),
      loader: 'js',
    }));
  },
};

await mkdir(outputDirectory, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(repositoryRoot, 'apps/api/src/runtime.ts')],
  compile: { outfile: executablePath },
  external: ['canvas', 'jsdom', 'jsdom/*', 'source-map-support'],
  plugins: [embeddedDependencyDataPlugin],
  minify: true,
  define: {
    'process.env.DRAFTILA_RUNTIME_VERSION': JSON.stringify(values.version),
  },
});
if (!result.success) {
  throw new AggregateError(result.logs, 'Unable to build the Draftila runtime');
}

await cp(join(repositoryRoot, 'apps/web/dist'), join(outputDirectory, 'web'), {
  recursive: true,
});
await cp(queryEngineSourcePath, join(outputDirectory, queryEngineName));
await writeFile(
  join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(
    {
      version: values.version,
      target,
      executable: basename(executablePath),
      queryEngine: queryEngineName,
    },
    null,
    2,
  )}\n`,
);

const manifest = JSON.parse(await readFile(join(outputDirectory, 'manifest.json'), 'utf8')) as {
  version: string;
};
if (manifest.version !== values.version) throw new Error('Runtime manifest verification failed');
