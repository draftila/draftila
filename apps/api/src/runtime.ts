const runtimeVersion = process.env.DRAFTILA_RUNTIME_VERSION ?? 'development';

async function prepareDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');
  const { migrateSqliteDatabase } = await import('./db/sqlite-migrations');
  migrateSqliteDatabase(databaseUrl);
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const command = args[0] ?? 'serve';
  if (command === 'version') {
    console.log(runtimeVersion);
    return;
  }
  if (process.env.DB_DRIVER !== 'sqlite') {
    throw new Error('The native Draftila runtime supports SQLite only');
  }
  await prepareDatabase();
  if (command === 'serve') {
    if (
      args[1] !== '--instance-id' ||
      !args[2] ||
      args[2] !== process.env.DRAFTILA_RUNTIME_INSTANCE_ID
    ) {
      throw new Error('The native Draftila runtime instance identity is invalid');
    }
    await import('./index');
    return;
  }
  if (command === 'admin') {
    const { runManageAdminCommand } = await import('./commands/manage-admin');
    await runManageAdminCommand(args.slice(1));
    return;
  }
  if (command === 'check') {
    const { app } = await import('./app');
    const response = await app.request('/api/health');
    if (!response.ok) throw new Error('The native Draftila runtime self-check failed');
    return;
  }
  if (command === 'migrate') return;
  throw new Error('Usage: draftila-runtime <serve|admin|check|migrate|version>');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
