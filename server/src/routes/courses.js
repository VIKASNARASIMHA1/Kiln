import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../utils/asyncHandler.js';
import { touchActivity } from '../utils/stats.js';
import { getCourse, getLessonIdIfExists, getLessonWithBody, listCoursesWithProgress, listLessonCards, listTrackLessonCards } from '../db/content.js';
import { getProgress, markLessonCompleted, progressForLessons, progressForUser } from '../db/activity.js';
import { saveUserStats } from '../db/users.js';

const router = Router();

const lessonCard = (l, p) => ({
  id: l.id,
  title: l.title,
  difficulty: l.difficulty,
  order: l.order,
  topics: l.topics,
  completed: !!p?.completed,
  bestScore: p?.bestScore ?? null,
});

router.get('/courses', requireAuth, async (req, res) => {
  const courses = await listCoursesWithProgress(req.user.id);
  res.json({
    courses: courses.map((c) => ({ id: c.id, title: c.title, track: c.track, description: c.description, total: c.total, done: c.done })),
  });
});

router.get('/courses/:id', requireAuth, async (req, res) => {
  const course = await getCourse(req.params.id);
  if (!course) throw notFound('Course not found');
  const lessons = await listLessonCards(course.id);
  const progress = await progressForLessons(req.user.id, lessons.map((l) => l.id));
  const pMap = new Map(progress.map((p) => [p.lesson, p]));
  res.json({
    course: { id: course.id, title: course.title, track: course.track, description: course.description },
    lessons: lessons.map((l) => lessonCard(l, pMap.get(l.id))),
  });
});

router.get('/lessons/:id', requireAuth, async (req, res) => {
  const lesson = await getLessonWithBody(req.params.id);
  if (!lesson) throw notFound('Lesson not found');
  const p = await getProgress(req.user.id, lesson.id);
  res.json({ lesson: { ...lessonCard(lesson, p), body: lesson.body, courseId: lesson.course } });
});

router.post('/lessons/:id/complete', requireAuth, async (req, res) => {
  const lessonId = await getLessonIdIfExists(req.params.id);
  if (!lessonId) throw notFound('Lesson not found');
  const existing = await getProgress(req.user.id, lessonId);
  if (!existing?.completed) {
    await markLessonCompleted(req.user.id, lessonId);
    req.user.stats.lessonsCompleted = (req.user.stats.lessonsCompleted || 0) + 1;
  }
  touchActivity(req.user);
  await saveUserStats(req.user);
  res.json({ completed: true, lessonsCompleted: req.user.stats.lessonsCompleted });
});

router.get('/progress', requireAuth, async (req, res) => {
  const lessons = await listTrackLessonCards(req.user.track);
  const progress = await progressForUser(req.user.id);
  const pMap = new Map(progress.map((p) => [p.lesson, p]));
  res.json({ lessons: lessons.map((l) => lessonCard(l, pMap.get(l.id))) });
});

export default router;
