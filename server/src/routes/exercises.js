import { Router } from 'express';
import { decodeTests, getExerciseForGrading, getExerciseHints, getExercisePublic, listExerciseCards } from '../db/content.js';
import { bumpHintsUsed, exerciseProgressFor, getExerciseProgress, recordSubmission, saveLastCode } from '../db/activity.js';
import { saveUserStats } from '../db/users.js';
import { requireAuth } from '../middleware/auth.js';
import { createUserLimiter } from '../middleware/rateLimit.js';
import { gradeCode } from '../services/sandboxClient.js';
import { bad, HttpError, notFound } from '../utils/asyncHandler.js';
import { touchActivity } from '../utils/stats.js';
import { env } from '../config/env.js';

const router = Router();
router.use(requireAuth);

const allowRun = createUserLimiter(env.runLimitPer10Min);
const limitRuns = (req, _res, next) => {
  if (!allowRun(req.user.id)) throw new HttpError(429, 'You have run a lot of code recently. Wait a few minutes and try again.');
  next();
};

export function validateCode(code) {
  if (typeof code !== 'string' || !code.trim()) throw bad('Write some code first');
  if (code.length > 10000) throw bad('Your code is too long (limit 10,000 characters)');
  if (code.includes('\0')) throw bad('Your code contains an invalid character');
  return code;
}

const failedLine = (e) => ({ type: e?.type, message: e?.message, line: e?.line });

/**
 * Turns the runner's raw result into what the browser may see.
 * Visible tests show inputs and expected values; hidden tests only show pass or fail.
 */
export function shapeResults(raw, visible, hidden) {
  const status = raw.timedOut ? 'timeout' : raw.crashed ? 'crashed' : raw.error ? 'error' : 'ok';
  const results = [];
  if (status === 'ok') {
    const all = [...visible, ...hidden];
    all.forEach((t, i) => {
      const r = raw.results?.[i] ?? { passed: false, got: null, error: null };
      if (i < visible.length) {
        results.push({ kind: 'visible', label: `Test ${i + 1}`, args: t.args, expected: t.expected, got: r.got, passed: !!r.passed, error: r.error ? failedLine(r.error) : null });
      } else {
        // Never reveal hidden inputs, expected values or exception text (it could contain the input).
        results.push({ kind: 'hidden', label: `Hidden test ${i - visible.length + 1}`, passed: !!r.passed, error: r.error ? { type: r.error.type } : null });
      }
    });
  }
  return {
    status,
    message: raw.message || null,
    error: raw.error ? failedLine(raw.error) : null,
    stdout: raw.stdout || '',
    stdoutTruncated: !!raw.stdoutTruncated,
    results,
    passedCount: results.filter((r) => r.passed).length,
    total: visible.length + hidden.length,
  };
}

const card = (e, p) => ({ id: e.id, title: e.title, difficulty: e.difficulty, order: e.order, solved: !!p?.solved, attempts: p?.attempts ?? 0 });

router.get('/lesson/:lessonId', async (req, res) => {
  const exercises = await listExerciseCards(req.params.lessonId);
  const progress = await exerciseProgressFor(req.user.id, exercises.map((e) => e.id));
  const byEx = new Map(progress.map((p) => [p.exercise, p]));
  res.json({ exercises: exercises.map((e) => card(e, byEx.get(e.id))) });
});

router.get('/:id', async (req, res) => {
  const ex = await getExercisePublic(req.params.id);
  if (!ex) throw notFound('Exercise not found');
  const p = await getExerciseProgress(req.user.id, ex.id);
  const used = p?.hintsUsed ?? 0;
  res.json({
    exercise: {
      id: ex.id,
      lessonId: ex.lesson,
      title: ex.title,
      difficulty: ex.difficulty,
      prompt: ex.prompt,
      functionName: ex.functionName,
      starter: ex.starter,
      visibleTests: decodeTests(ex.visibleTests),
      hintsTotal: ex.hints.length,
      hintsShown: ex.hints.slice(0, used),
      solved: !!p?.solved,
      attempts: p?.attempts ?? 0,
      lastCode: p?.lastCode || '',
    },
  });
});

// Run: visible tests only. Does not count as an attempt.
router.post('/:id/run', limitRuns, async (req, res) => {
  const code = validateCode(req.body?.code);
  const ex = await getExerciseForGrading(req.params.id);
  if (!ex) throw notFound('Exercise not found');
  const visible = decodeTests(ex.visibleTests);
  const raw = await gradeCode({ code, functionName: ex.functionName, tests: visible });
  await saveLastCode(req.user.id, ex.id, code);
  res.json(shapeResults(raw, visible, []));
});

// Submit: visible + hidden tests. Counts as an attempt and can mark the exercise solved.
router.post('/:id/submit', limitRuns, async (req, res) => {
  const code = validateCode(req.body?.code);
  const ex = await getExerciseForGrading(req.params.id);
  if (!ex) throw notFound('Exercise not found');
  const visible = decodeTests(ex.visibleTests);
  const hidden = decodeTests(ex.hiddenTests);
  const raw = await gradeCode({ code, functionName: ex.functionName, tests: [...visible, ...hidden] });
  const shaped = shapeResults(raw, visible, hidden);
  const solved = shaped.status === 'ok' && shaped.passedCount === shaped.total;

  const before = await getExerciseProgress(req.user.id, ex.id);
  const newlySolved = solved && !before?.solved;
  await recordSubmission(req.user.id, ex.id, { code, solved, passed: shaped.passedCount });
  if (newlySolved) req.user.stats.exercisesSolved = (req.user.stats.exercisesSolved || 0) + 1;
  touchActivity(req.user);
  await saveUserStats(req.user);
  res.json({ ...shaped, solved, newlySolved, exercisesSolved: req.user.stats.exercisesSolved });
});

// Hints are revealed one at a time; each one is counted in the learner's stats.
router.post('/:id/hint', async (req, res) => {
  const ex = await getExerciseHints(req.params.id);
  if (!ex) throw notFound('Exercise not found');
  const p = await getExerciseProgress(req.user.id, ex.id);
  const used = p?.hintsUsed ?? 0;
  if (used >= ex.hints.length) throw notFound('No more hints for this exercise');
  await bumpHintsUsed(req.user.id, ex.id);
  req.user.stats.hintRequests = (req.user.stats.hintRequests || 0) + 1;
  await saveUserStats(req.user);
  res.json({ hint: ex.hints[used], hintsUsed: used + 1, remaining: ex.hints.length - used - 1 });
});

export default router;
