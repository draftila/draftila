import { db } from './index';

const allowedEnvs = ['development', 'test'];
if (!allowedEnvs.includes(process.env.NODE_ENV ?? 'development')) {
  console.error('Refusing to run reset in production environment');
  process.exit(1);
}

async function reset() {
  console.log('Deleting all records...');

  await safeDeleteMany(() => db.draft.deleteMany());
  await safeDeleteMany(() => db.project.deleteMany());
  await safeDeleteMany(() => db.session.deleteMany());
  await safeDeleteMany(() => db.account.deleteMany());
  await safeDeleteMany(() => db.verification.deleteMany());
  await safeDeleteMany(() => db.user.deleteMany());

  console.log('All records deleted.');
  await db.$disconnect();
}

async function safeDeleteMany(deleteMany: () => Promise<unknown>) {
  try {
    await deleteMany();
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const errorWithCode = error as Error & { code?: string };
  return errorWithCode.code === 'P2021';
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
