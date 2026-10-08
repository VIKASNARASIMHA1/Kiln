// Usage: npm run ingest   (rebuilds search chunks after editing lesson text)
import { closeDb, connectDb } from '../db/pool.js';
import { ingestAll } from '../services/ragService.js';

connectDb()
  .then(ingestAll)
  .then((n) => console.log(`Indexed ${n} chunks`))
  .catch((e) => {
    console.error('Ingest failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
