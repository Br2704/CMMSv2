import { AppDataSource } from '../data-source';
import { runSeed } from './seed';

async function seedRunner() {
  await AppDataSource.initialize();
  const result = await runSeed();
  // eslint-disable-next-line no-console
  console.log('Seed completed', result);
  await AppDataSource.destroy();
}

seedRunner().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed', error);
  process.exit(1);
});
