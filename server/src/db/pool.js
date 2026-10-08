import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|postgres|db|host\.docker\.internal)$/i;

/** TLS settings. Neon requires TLS; a local or Docker Postgres normally does not. */
export function sslFor(url, forced = env.databaseSsl) {
  if (forced === false) return undefined;
  let host = '';
  let hasMode = false;
  try {
    const u = new URL(url);
    host = u.hostname;
    hasMode = u.searchParams.has('sslmode');
  } catch {
    /* not a URL: let pg report the problem */
  }
  if (forced === true || (!LOCAL_HOST.test(host) && !hasMode)) return { rejectUnauthorized: true };
  return undefined; // pg reads ?sslmode=... from the URL itself
}

// Neon pooled connections (PgBouncer, transaction mode) work because nothing here uses session state.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: sslFor(env.databaseUrl),
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000, // a Neon database that scaled to zero needs a moment to wake up
});
// An idle client can be dropped by Neon when the compute suspends. Log it and let the pool replace it.
pool.on('error', (e) => console.warn('Database connection dropped:', e.message));

export const query = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] ?? null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

/** Runs fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Creates the tables if they are missing. Safe to call on every start. */
export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  // Two instances starting together must not race on CREATE TABLE.
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727274)');
    await c.query(sql);
  });
}

/** Connects (retrying while a sleeping Neon database wakes up) and makes sure the schema exists. */
export async function connectDb({ retries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (attempt > retries) throw new Error(`Cannot reach the database (${e.message}). Check DATABASE_URL.`);
      console.warn(`Database not ready (${e.message}). Retrying ${attempt}/${retries}...`);
      await sleep(1500 * attempt);
    }
  }
  await migrate();
  return pool;
}

export const closeDb = () => pool.end();
