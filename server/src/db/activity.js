import { many, one } from './pool.js';

// ---------- lesson progress ----------
const P = `lesson_id AS lesson, completed, best_score AS "bestScore", attempts`;

export const progressForUser = (userId) => many(`SELECT ${P} FROM progress WHERE user_id = $1`, [userId]);
export const progressForLessons = (userId, lessonIds) =>
  lessonIds.length ? many(`SELECT ${P} FROM progress WHERE user_id = $1 AND lesson_id = ANY($2::uuid[])`, [userId, lessonIds]) : [];
export const getProgress = (userId, lessonId) => one(`SELECT ${P} FROM progress WHERE user_id = $1 AND lesson_id = $2`, [userId, lessonId]);
export const completedLessonIds = async (userId) =>
  (await many('SELECT lesson_id FROM progress WHERE user_id = $1 AND completed', [userId])).map((r) => r.lesson_id);

export const markLessonCompleted = (userId, lessonId) =>
  one(
    `INSERT INTO progress (user_id, lesson_id, completed) VALUES ($1, $2, true)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET completed = true, updated_at = now()`,
    [userId, lessonId]
  );

/** Records a quiz result: keeps the best score and counts the attempt. */
export const recordQuizScore = (userId, lessonId, score) =>
  one(
    `INSERT INTO progress (user_id, lesson_id, best_score, attempts) VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, lesson_id) DO UPDATE
       SET best_score = GREATEST(COALESCE(progress.best_score, 0), EXCLUDED.best_score),
           attempts = progress.attempts + 1, updated_at = now()`,
    [userId, lessonId, score]
  );

// ---------- quizzes ----------
export const createQuizAttempt = async ({ userId, lessonId, questions, source }) =>
  (await one(
    `INSERT INTO quiz_attempts (user_id, lesson_id, questions, source) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
    [userId, lessonId, JSON.stringify(questions), source]
  )).id;

export const getQuizAttempt = (id, userId) =>
  one(
    `SELECT id, lesson_id AS lesson, questions, answers, score, submitted, source
       FROM quiz_attempts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

/** Marks the attempt submitted. Returns false if it was already submitted (two quick clicks cannot both count). */
export async function submitQuizAttempt(id, answers, score) {
  const r = await one(
    `UPDATE quiz_attempts SET answers = $2::jsonb, score = $3, submitted = true, updated_at = now()
      WHERE id = $1 AND NOT submitted RETURNING id`,
    [id, JSON.stringify(answers), score]
  );
  return !!r;
}

// ---------- tutor chat ----------
export const createChatSession = async (userId, lessonId) =>
  (await one('INSERT INTO chat_sessions (user_id, lesson_id) VALUES ($1, $2) RETURNING id', [userId, lessonId || null])).id;

export const getChatSession = (id, userId) =>
  one('SELECT id, lesson_id AS lesson, messages, updated_at AS "updatedAt" FROM chat_sessions WHERE id = $1 AND user_id = $2', [id, userId]);

export const appendChatMessages = (id, messages) =>
  one(`UPDATE chat_sessions SET messages = messages || $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(messages)]);

export const listChatSessions = (userId, limit = 20) =>
  many(
    `SELECT id, lesson_id AS lesson, updated_at AS "updatedAt", COALESCE(left(messages -> 0 ->> 'content', 80), '') AS preview
       FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit]
  );

// ---------- coding exercises ----------
const EP = `exercise_id AS exercise, solved, attempts, best_passed AS "bestPassed", hints_used AS "hintsUsed", last_code AS "lastCode"`;

export const getExerciseProgress = (userId, exerciseId) =>
  one(`SELECT ${EP} FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2`, [userId, exerciseId]);
export const exerciseProgressFor = (userId, exerciseIds) =>
  exerciseIds.length ? many(`SELECT ${EP} FROM exercise_progress WHERE user_id = $1 AND exercise_id = ANY($2::uuid[])`, [userId, exerciseIds]) : [];

export const saveLastCode = (userId, exerciseId, code) =>
  one(
    `INSERT INTO exercise_progress (user_id, exercise_id, last_code) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, exercise_id) DO UPDATE SET last_code = EXCLUDED.last_code, updated_at = now()`,
    [userId, exerciseId, code]
  );

export const recordSubmission = (userId, exerciseId, { code, solved, passed }) =>
  one(
    `INSERT INTO exercise_progress (user_id, exercise_id, last_code, solved, best_passed, attempts)
     VALUES ($1, $2, $3, $4, $5, 1)
     ON CONFLICT (user_id, exercise_id) DO UPDATE
       SET last_code = EXCLUDED.last_code,
           solved = exercise_progress.solved OR EXCLUDED.solved,
           best_passed = GREATEST(exercise_progress.best_passed, EXCLUDED.best_passed),
           attempts = exercise_progress.attempts + 1, updated_at = now()`,
    [userId, exerciseId, code, solved, passed]
  );

export const bumpHintsUsed = (userId, exerciseId) =>
  one(
    `INSERT INTO exercise_progress (user_id, exercise_id, hints_used) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, exercise_id) DO UPDATE SET hints_used = exercise_progress.hints_used + 1, updated_at = now()`,
    [userId, exerciseId]
  );
