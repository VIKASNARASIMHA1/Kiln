import { Router } from 'express';
import { getLessonWithQuestions } from '../db/content.js';
import { createQuizAttempt, getQuizAttempt, recordQuizScore, submitQuizAttempt } from '../db/activity.js';
import { saveUserStats } from '../db/users.js';
import { requireAuth } from '../middleware/auth.js';
import { bad, notFound } from '../utils/asyncHandler.js';
import { explainMistake, generateQuiz } from '../services/agentService.js';
import { recordQuiz, touchActivity } from '../utils/stats.js';
import { createUserLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.use(requireAuth);
const allowGenerate = createUserLimiter(15);

export function gradeAnswers(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length) return null;
  if (!answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) return null;
  const results = questions.map((q, i) => ({
    correct: answers[i] === q.answer,
    chosen: answers[i],
    answer: q.answer,
    explanation: q.explanation,
  }));
  const right = results.filter((r) => r.correct).length;
  return { results, score: Math.round((right / questions.length) * 100) };
}

router.post('/generate', async (req, res) => {
  if (typeof req.body?.lessonId !== 'string') throw bad('Choose a lesson first');
  const lesson = await getLessonWithQuestions(req.body.lessonId);
  if (!lesson) throw notFound('Lesson not found');
  if (!allowGenerate(req.user.id)) throw bad('You have generated many quizzes recently. Wait a few minutes and try again.');
  const { questions, source } = await generateQuiz(lesson, 5);
  if (!questions.length) throw bad('This lesson has no quiz questions yet');
  const attemptId = await createQuizAttempt({ userId: req.user.id, lessonId: lesson.id, questions, source });
  res.status(201).json({
    attemptId,
    lessonTitle: lesson.title,
    source,
    // answers are never sent before submission
    questions: questions.map((q) => ({ prompt: q.prompt, options: q.options })),
  });
});

router.post('/:attemptId/submit', async (req, res) => {
  const attempt = await getQuizAttempt(req.params.attemptId, req.user.id);
  if (!attempt) throw notFound('Quiz not found');
  if (attempt.submitted) throw bad('This quiz was already submitted');
  const graded = gradeAnswers(attempt.questions, req.body?.answers);
  if (!graded) throw bad(`Send one answer (0-3, or -1 for skipped) for each of the ${attempt.questions.length} questions`);

  // The database only accepts the first submission, so a double click cannot count twice.
  if (!(await submitQuizAttempt(attempt.id, req.body.answers, graded.score))) throw bad('This quiz was already submitted');
  await recordQuizScore(req.user.id, attempt.lesson, graded.score);
  recordQuiz(req.user, graded.score);
  touchActivity(req.user);
  await saveUserStats(req.user);

  res.json({ score: graded.score, results: graded.results, stats: req.user.stats });
});

router.post('/explain', async (req, res) => {
  const { attemptId, questionIndex } = req.body || {};
  if (typeof attemptId !== 'string') throw bad('Submit the quiz before asking for an explanation');
  const attempt = await getQuizAttempt(attemptId, req.user.id);
  if (!attempt?.submitted) throw bad('Submit the quiz before asking for an explanation');
  const q = attempt.questions[questionIndex];
  if (!q) throw bad('Unknown question');
  const lesson = await getLessonWithQuestions(attempt.lesson);
  req.user.stats.hintRequests = (req.user.stats.hintRequests || 0) + 1;
  await saveUserStats(req.user);
  res.json(await explainMistake({ lesson, question: q, chosenIndex: attempt.answers[questionIndex] }));
});

export default router;
