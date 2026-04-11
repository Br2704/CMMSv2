import { ensureSelectedDatabaseExists } from './ensure-database';

async function run() {
  await ensureSelectedDatabaseExists();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Database ensure failed', error);
  process.exit(1);
});
