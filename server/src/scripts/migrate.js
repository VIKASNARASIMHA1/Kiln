// Usage: npm run migrate   (creates the tables if they are missing; safe to repeat)
import { closeDb, connectDb } from '../db/pool.js';

connectDb()
  .then(() => console.log('Database schema is up to date.'))
  .catch((e) => {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
