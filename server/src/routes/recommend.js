import { Router } from 'express';
import { listTrackLessonsWithBody } from '../db/content.js';
import { completedLessonIds } from '../db/activity.js';
import { requireAuth } from '../middleware/auth.js';
import { recommendDifficulty, similarLessons } from '../services/aiClient.js';

const router = Router();
router.use(requireAuth);

const LEVEL = { 1: 'easy', 2: 'medium', 3: 'hard' };

/** Picks the unfinished lesson whose difficulty is closest to the RL-recommended level. */
export function pickNext(lessons, doneIds, wanted) {
  const todo = lessons.filter((l) => !doneIds.has(String(l.id)));
  if (!todo.length) return null;
  return [...todo].sort((a, b) => Math.abs(a.difficulty - wanted) - Math.abs(b.difficulty - wanted) || a.order - b.order)[0];
}

router.get('/next', async (req, res) => {
  const lessons = await listTrackLessonsWithBody(req.user.track);
  const doneIds = new Set(await completedLessonIds(req.user.id));

  const avg = req.user.stats.quizzesTaken ? req.user.stats.avgQuizScore : 40; // new learners start easy
  const rec = await recommendDifficulty(avg);
  const next = pickNext(lessons, doneIds, rec.difficulty);
  if (!next) return res.json({ next: null, message: 'You have finished every lesson in your track.' });

  const related = await similarLessons(
    lessons.map((l) => ({ id: l.id, text: `${l.title} ${l.body}` })),
    [...doneIds],
    3
  );
  const titleOf = new Map(lessons.map((l) => [l.id, l.title]));
  res.json({
    next: { id: next.id, title: next.title, difficulty: next.difficulty },
    reason: `Your quiz average is ${Math.round(avg)}%, so the scheduler suggests ${LEVEL[rec.difficulty]} material.`,
    source: rec.source,
    related: related.filter((r) => String(r.id) !== String(next.id)).map((r) => ({ id: r.id, title: titleOf.get(r.id), score: r.score })),
  });
});

export default router;
