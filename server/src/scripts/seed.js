// Usage: npm run seed   (wipes and recreates demo data; learners are SIMULATED)
import { closeDb, connectDb } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';

connectDb()
  .then(() => seedDatabase())
  .catch((e) => {
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
