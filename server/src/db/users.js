import { many, one } from './pool.js';

export const STAT_DEFAULTS = {
  avgQuizScore: 0,
  quizzesTaken: 0,
  lessonsCompleted: 0,
  streakDays: 0,
  avgSessionMinutes: 0,
  daysSinceLastActive: 0,
  tutorQuestions: 0,
  hintRequests: 0,
  exercisesSolved: 0,
  weeklyEngagement: [],
};

const COLS = `id, name, email, role, track, is_demo AS "isDemo", is_simulated AS "isSimulated", stats, last_active_at AS "lastActiveAt"`;

const shape = (r) => (r ? { ...r, stats: { ...STAT_DEFAULTS, ...(r.stats || {}), weeklyEngagement: r.stats?.weeklyEngagement ?? [] } } : null);

export async function findUserById(id) {
  return shape(await one(`SELECT ${COLS} FROM users WHERE id = $1`, [id]));
}

/** Includes the password hash. Only the login route should use this. */
export async function findUserForLogin(email) {
  const r = await one(`SELECT ${COLS}, password_hash AS "passwordHash" FROM users WHERE lower(email) = lower($1)`, [email]);
  return shape(r);
}

export async function emailExists(email) {
  return !!(await one('SELECT 1 AS x FROM users WHERE lower(email) = lower($1)', [email]));
}

export async function findDemoUser(role) {
  return shape(await one(`SELECT ${COLS} FROM users WHERE is_demo AND role = $1 ORDER BY created_at LIMIT 1`, [role]));
}

export async function createUser({ name, email, passwordHash, role = 'student', track = 'python' }) {
  return shape(
    await one(
      `INSERT INTO users (name, email, password_hash, role, track, stats)
       VALUES ($1, lower(trim($2)), $3, $4, $5, $6::jsonb) RETURNING ${COLS}`,
      [name, email, passwordHash, role, track, JSON.stringify(STAT_DEFAULTS)]
    )
  );
}

/** Writes back the fields that change while a learner uses the app (stats and last-active time). */
export async function saveUserStats(user) {
  await one('UPDATE users SET stats = $2::jsonb, last_active_at = $3, updated_at = now() WHERE id = $1', [
    user.id,
    JSON.stringify(user.stats),
    user.lastActiveAt || new Date(),
  ]);
}

/** Real (non-demo) students, with just what the teacher dashboard needs. */
export async function listLearners() {
  return many(`SELECT id, name, track, stats FROM users WHERE role = 'student' AND NOT is_demo ORDER BY created_at, id`);
}
