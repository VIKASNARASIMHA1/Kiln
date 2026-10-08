import { many, one, query, tx } from './pool.js';

// ---------- exercise tests ----------
// Test data is stored as JSON (jsonb), which keeps nested arrays, null and {} intact.
// jsonb cannot hold the NUL character, so the encoder rejects it instead of failing in the database.
/** [{args: any[], expected: any}] <-> stored form */
export const encodeTests = (tests = []) =>
  tests.map((t) => {
    const out = { args: t.args ?? [], expected: t.expected ?? null };
    if (JSON.stringify(out).includes('\\u0000')) throw new Error('Test data cannot contain the NUL character');
    return out;
  });
export const decodeTests = (tests = []) => tests.map((t) => ({ args: t.args ?? [], expected: t.expected ?? null }));

// ---------- courses ----------
export const listCoursesWithProgress = (userId) =>
  many(
    `SELECT c.id, c.title, c.track, c.description,
            count(l.id)::int AS total,
            count(p.id) FILTER (WHERE p.completed)::int AS done
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = $1
      GROUP BY c.id
      ORDER BY c.sort_order, c.title`,
    [userId]
  );

export const getCourse = (id) => one('SELECT id, title, track, description FROM courses WHERE id = $1', [id]);

// ---------- lessons ----------
const LESSON_CARD = `id, course_id AS course, title, difficulty, sort_order AS "order", topics`;

export const listLessonCards = (courseId) => many(`SELECT ${LESSON_CARD} FROM lessons WHERE course_id = $1 ORDER BY sort_order`, [courseId]);
export const listTrackLessonCards = (track) => many(`SELECT ${LESSON_CARD} FROM lessons WHERE track = $1 ORDER BY sort_order`, [track]);
export const listTrackLessonsWithBody = (track) =>
  many(`SELECT ${LESSON_CARD}, body FROM lessons WHERE track = $1 ORDER BY sort_order`, [track]);
export const getLessonWithBody = (id) => one(`SELECT ${LESSON_CARD}, body FROM lessons WHERE id = $1`, [id]);
export const getLessonIdIfExists = async (id) => (await one('SELECT id FROM lessons WHERE id = $1', [id]))?.id ?? null;
/** Lesson with its quiz question bank. Never send this straight to a learner: it contains the answers. */
export const getLessonWithQuestions = (id) => one(`SELECT ${LESSON_CARD}, track, body, questions FROM lessons WHERE id = $1`, [id]);
export const listAllLessons = () => many(`SELECT ${LESSON_CARD}, track, slug, body, questions FROM lessons ORDER BY track, sort_order`);

// ---------- search chunks (tutor) ----------
export const listChunks = () => many(`SELECT id, lesson_id AS lesson, track, title, text, sort_order AS "order" FROM chunks`);

/** Replaces all search chunks. rows: [{lesson, track, title, text, order}] */
export async function replaceChunks(rows, client) {
  const run = async (c) => {
    await c.query('DELETE FROM chunks');
    if (!rows.length) return;
    await c.query(
      `INSERT INTO chunks (lesson_id, track, title, text, sort_order)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::int[])`,
      [rows.map((r) => r.lesson), rows.map((r) => r.track), rows.map((r) => r.title), rows.map((r) => r.text), rows.map((r) => r.order)]
    );
  };
  return client ? run(client) : tx(run);
}

// ---------- exercises ----------
const EX_CARD = `id, title, difficulty, sort_order AS "order"`;
export const listExerciseCards = (lessonId) => many(`SELECT ${EX_CARD} FROM exercises WHERE lesson_id = $1 ORDER BY sort_order`, [lessonId]);

/** Everything a learner may see. Hidden tests are not selected at all. */
export const getExercisePublic = async (id) => {
  const r = await one(
    `SELECT ${EX_CARD}, lesson_id AS lesson, prompt, function_name AS "functionName", starter, visible_tests AS "visibleTests", hints
       FROM exercises WHERE id = $1`,
    [id]
  );
  return r;
};

/** Server-side only: includes hidden tests. */
export const getExerciseForGrading = (id) =>
  one(`SELECT id, function_name AS "functionName", visible_tests AS "visibleTests", hidden_tests AS "hiddenTests" FROM exercises WHERE id = $1`, [id]);

export const getExerciseHints = (id) => one('SELECT id, hints FROM exercises WHERE id = $1', [id]);

export { query };
