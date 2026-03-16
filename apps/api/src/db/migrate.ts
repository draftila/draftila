const dbDriver = process.env.DB_DRIVER ?? 'postgresql';

function getSchemaPath() {
  if (dbDriver === 'sqlite') {
    return 'prisma/sqlite/schema.prisma';
  }
  if (dbDriver === 'postgresql') {
    return 'prisma/postgresql/schema.prisma';
  }
  throw new Error('DB_DRIVER must be either "postgresql" or "sqlite"');
}

await Bun.$`bunx --bun prisma db push --schema ${getSchemaPath()}`;

export {};
