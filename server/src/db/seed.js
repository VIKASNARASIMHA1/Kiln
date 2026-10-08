// Loads courses, lessons, coding exercises, search chunks and simulated learners.
// Learners are SIMULATED (see data/generate_synthetic.py).
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { one, tx } from './pool.js';
import { STAT_DEFAULTS } from './users.js';
import { encodeTests, replaceChunks } from './content.js';
import { lessonChunks } from '../services/ragService.js';

export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_STUDENT = 'student@kiln.dev';
export const DEMO_TEACHER = 'teacher@kiln.dev';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export async function isEmpty() {
  const r = await one('SELECT (SELECT count(*) FROM courses)::int AS courses, (SELECT count(*) FROM users)::int AS users');
  return r.courses === 0 && r.users === 0;
}

/** Wipes every table and loads the demo data again, all in one transaction. */
export async function seedDatabase({ log = console.log } = {}) {
  const content = path.join(env.dataDir, 'course_content');
  const learnersFile = path.join(env.dataDir, 'generated', 'learners.json');
  if (!fs.existsSync(learnersFile)) throw new Error(`Missing ${learnersFile}. Run: python data/generate_synthetic.py`);

  const manifest = readJson(path.join(content, 'manifest.json'));
  const questions = readJson(path.join(content, 'questions.json'));
  const exercises = readJson(path.join(content, 'exercises.json'));
  const learners = readJson(learnersFile);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const summary = await tx(async (c) => {
    await c.query('TRUNCATE exercise_progress, exercises, chat_sessions, quiz_attempts, progress, chunks, lessons, courses, users RESTART IDENTITY CASCADE');

    const lessonRows = [];
    for (const course of manifest) {
      const { rows } = await c.query('INSERT INTO courses (title, slug, track, description, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id', [
        course.title, course.slug, course.track, course.description, course.order,
      ]);
      for (const [i, l] of course.lessons.entries()) {
        const body = fs.readFileSync(path.join(content, l.file), 'utf8');
        const res = await c.query(
          `INSERT INTO lessons (course_id, track, title, slug, sort_order, difficulty, topics, body, questions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
          [rows[0].id, course.track, l.title, l.slug, i, l.difficulty, l.topics || [], body, JSON.stringify(questions[l.slug] || [])]
        );
        lessonRows.push({ id: res.rows[0].id, slug: l.slug, track: course.track, title: l.title, body, difficulty: l.difficulty });
      }
    }

    const chunkRows = lessonChunks(lessonRows);
    await replaceChunks(chunkRows, c);

    const orderInLesson = {};
    for (const e of exercises) {
      const lesson = lessonRows.find((l) => l.slug === e.lesson);
      if (!lesson) throw new Error(`Exercise ${e.slug} refers to unknown lesson ${e.lesson}`);
      orderInLesson[e.lesson] = (orderInLesson[e.lesson] ?? -1) + 1;
      await c.query(
        `INSERT INTO exercises (lesson_id, slug, title, sort_order, difficulty, prompt, function_name, starter, visible_tests, hidden_tests, hints)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
        [lesson.id, e.slug, e.title, orderInLesson[e.lesson], e.difficulty, e.prompt, e.function, e.starter,
          JSON.stringify(encodeTests(e.visibleTests)), JSON.stringify(encodeTests(e.hiddenTests)), JSON.stringify(e.hints || [])]
      );
    }

    await c.query(
      `INSERT INTO users (name, email, password_hash, role, is_demo, stats) VALUES ('Demo Teacher', $1, $2, 'teacher', true, $3::jsonb)`,
      [DEMO_TEACHER, hash, JSON.stringify(STAT_DEFAULTS)]
    );
    const student = await c.query(
      `INSERT INTO users (name, email, password_hash, role, track, is_demo, stats) VALUES ('Demo Student', $1, $2, 'student', 'python', true, $3::jsonb) RETURNING id`,
      [DEMO_STUDENT, hash, JSON.stringify({ ...STAT_DEFAULTS, avgQuizScore: 60, quizzesTaken: 1, lessonsCompleted: 1, streakDays: 2, avgSessionMinutes: 20, tutorQuestions: 1 })]
    );
    const first = lessonRows.find((l) => l.track === 'python' && l.difficulty === 1);
    await c.query('INSERT INTO progress (user_id, lesson_id, completed, best_score, attempts) VALUES ($1,$2,true,60,1)', [student.rows[0].id, first.id]);

    await c.query(
      `INSERT INTO users (name, email, password_hash, role, track, is_simulated, stats)
       SELECT x.name, x.email, $2, 'student', x.track, true, x.stats FROM jsonb_to_recordset($1::jsonb) AS x(name text, email text, track text, stats jsonb)`,
      [JSON.stringify(learners.map((l) => ({ name: l.name, email: l.email, track: l.track, stats: { ...STAT_DEFAULTS, ...l.stats } }))), hash]
    );

    return { courses: manifest.length, lessons: lessonRows.length, chunks: chunkRows.length, exercises: exercises.length, learners: learners.length };
  });

  log(`Seeded ${summary.courses} courses, ${summary.lessons} lessons, ${summary.chunks} search chunks, ${summary.exercises} coding exercises, ${summary.learners} simulated learners.`);
  log(`Demo logins (password ${DEMO_PASSWORD}): ${DEMO_TEACHER}, ${DEMO_STUDENT}`);
  return summary;
}

/** Seeds only when the database is brand new. Used by AUTO_SEED so a first deploy has content. */
export async function seedIfEmpty(opts) {
  if (!(await isEmpty())) return null;
  return seedDatabase(opts);
}
