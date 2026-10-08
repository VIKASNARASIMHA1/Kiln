// Full-stack integration test. Needs a seeded Postgres database and (optionally) the AI service.
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kiln_test npm run seed
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kiln_test AI_SERVICE_URL=http://localhost:8000 npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';

const URI = process.env.TEST_DATABASE_URL;
const skip = !URI && 'set TEST_DATABASE_URL to run integration tests';

let server, base, student, teacher;

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test.before(async () => {
  if (!URI) return;
  process.env.DATABASE_URL = URI;
  const { connectDb } = await import('../src/db/pool.js');
  const { createApp } = await import('../src/app.js');
  const { attachSockets } = await import('../src/sockets/index.js');
  await connectDb();
  server = http.createServer(createApp());
  attachSockets(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (!URI) return;
  server.closeAllConnections?.();
  server.close();
  (await import('../src/db/pool.js')).closeDb();
});

test('guest login works for student and teacher', { skip }, async () => {
  const s = await api('/api/auth/guest', { method: 'POST', body: {} });
  const t = await api('/api/auth/guest', { method: 'POST', body: { role: 'teacher' } });
  assert.equal(s.status, 200);
  assert.equal(t.data.user.role, 'teacher');
  student = s.data;
  teacher = t.data;
  assert.equal((await api('/api/auth/me', { token: student.token })).data.user.email, 'student@kiln.dev');
});

test('register, duplicate email, wrong password, login', { skip }, async () => {
  const email = `t${Date.now()}@example.com`;
  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email, password: 'password123', track: 'web' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.role, 'student');
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email, password: 'password123' } })).status, 409);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email, password: 'wrongpass1' } })).status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email, password: 'password123' } })).status, 200);
  // role escalation attempt is ignored
  const sneaky = await api('/api/auth/register', { method: 'POST', body: { name: 'Sneaky', email: `s${Date.now()}@example.com`, password: 'password123', role: 'teacher' } });
  assert.equal(sneaky.data.user.role, 'student');
});

test('courses, course detail, lesson, completion', { skip }, async () => {
  const { data } = await api('/api/courses', { token: student.token });
  assert.equal(data.courses.length, 3);
  const py = data.courses.find((c) => c.track === 'python');
  const detail = await api(`/api/courses/${py.id}`, { token: student.token });
  assert.equal(detail.data.lessons.length, 3);
  assert.deepEqual(detail.data.lessons.map((l) => l.difficulty), [1, 2, 3]);
  const lesson = await api(`/api/lessons/${detail.data.lessons[1].id}`, { token: student.token });
  assert.ok(lesson.data.lesson.body.includes('function'));
  assert.equal(lesson.data.lesson.questions, undefined); // answers never exposed here
  const done = await api(`/api/lessons/${detail.data.lessons[1].id}/complete`, { method: 'POST', token: student.token });
  assert.equal(done.data.completed, true);
  const again = await api(`/api/lessons/${detail.data.lessons[1].id}/complete`, { method: 'POST', token: student.token });
  assert.equal(again.data.lessonsCompleted, done.data.lessonsCompleted); // idempotent
  assert.equal((await api('/api/lessons/not-an-id', { token: student.token })).status, 400);
});

test('quiz flow: generate hides answers, submit grades, explain works, no resubmit', { skip }, async () => {
  const py = (await api('/api/courses', { token: student.token })).data.courses.find((c) => c.track === 'python');
  const lessons = (await api(`/api/courses/${py.id}`, { token: student.token })).data.lessons;
  const gen = await api('/api/quiz/generate', { method: 'POST', token: student.token, body: { lessonId: lessons[0].id } });
  assert.equal(gen.status, 201);
  assert.equal(gen.data.questions.length, 3); // bank has 3 questions in demo mode
  assert.ok(gen.data.questions.every((q) => q.answer === undefined && q.options.length === 4));

  const before = (await api('/api/auth/me', { token: student.token })).data.user.stats;
  const sub = await api(`/api/quiz/${gen.data.attemptId}/submit`, { method: 'POST', token: student.token, body: { answers: [0, 0, 0] } });
  assert.equal(sub.status, 200);
  assert.ok(sub.data.score >= 0 && sub.data.score <= 100);
  assert.equal(sub.data.stats.quizzesTaken, before.quizzesTaken + 1);

  const wrong = sub.data.results.findIndex((r) => !r.correct);
  if (wrong >= 0) {
    const ex = await api('/api/quiz/explain', { method: 'POST', token: student.token, body: { attemptId: gen.data.attemptId, questionIndex: wrong } });
    assert.ok(ex.data.explanation.length > 5);
  }
  assert.equal((await api(`/api/quiz/${gen.data.attemptId}/submit`, { method: 'POST', token: student.token, body: { answers: [0, 0, 0] } })).status, 400);

  // another user cannot submit someone else's quiz
  const other = (await api('/api/auth/guest', { method: 'POST', body: { role: 'teacher' } })).data;
  const g2 = await api('/api/quiz/generate', { method: 'POST', token: student.token, body: { lessonId: lessons[0].id } });
  assert.equal((await api(`/api/quiz/${g2.data.attemptId}/submit`, { method: 'POST', token: other.token, body: { answers: [0, 0, 0] } })).status, 404);
  assert.equal((await api(`/api/quiz/${g2.data.attemptId}/submit`, { method: 'POST', token: student.token, body: { answers: [0] } })).status, 400);
});

test('recommendation returns an unfinished lesson with a reason', { skip }, async () => {
  const r = await api('/api/recommend/next', { token: student.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.next.title);
  assert.match(r.data.reason, /quiz average/);
  console.log('  recommender source:', r.data.source, '| related:', r.data.related.length);
});

test('analytics is teacher-only and returns model output', { skip }, async () => {
  assert.equal((await api('/api/analytics/overview', { token: student.token })).status, 403);
  const r = await api('/api/analytics/overview', { token: teacher.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.totals.students >= 120);
  assert.equal(r.data.riskDistribution.reduce((s, x) => s + x.count, 0), r.data.totals.students);
  assert.equal(r.data.engagement.history.length, 12);
  assert.equal(r.data.engagement.forecast.length, 4);
  console.log('  analytics source:', r.data.source, '| at risk shown:', r.data.atRisk.length, '| trend:', r.data.engagement.trend);
});

test('tutor streams a grounded answer over Socket.io and saves history', { skip }, async () => {
  const sock = connect(base, { auth: { token: student.token }, transports: ['websocket'] });
  await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
  const events = { tokens: [], sources: [], done: null };
  const finished = new Promise((res, rej) => {
    sock.on('tutor:start', (d) => (events.sources = d.sources));
    sock.on('tutor:token', (d) => events.tokens.push(d.text));
    sock.on('tutor:done', (d) => { events.done = d; res(); });
    sock.on('tutor:error', (d) => rej(new Error(d.message)));
  });
  sock.emit('tutor:ask', { question: 'What does gradient descent do?' });
  await finished;
  const text = events.tokens.join('');
  assert.ok(events.tokens.length > 5, 'answer arrives in several chunks');
  assert.ok(events.sources[0].title.includes('Neural networks'), `top source: ${events.sources[0]?.title}`);
  assert.match(text, /gradient|weights|loss/i);
  const hist = await api(`/api/tutor/sessions/${events.done.sessionId}`, { token: student.token });
  assert.equal(hist.data.messages.length, 2);

  const bad = new Promise((res) => sock.once('tutor:error', res));
  sock.emit('tutor:ask', { question: 'x' });
  assert.match((await bad).message, /between 2 and 1000/);
  sock.close();

  const unauth = connect(base, { auth: { token: 'bad' }, transports: ['websocket'], reconnection: false });
  const err = await new Promise((res) => unauth.on('connect_error', res));
  assert.match(err.message, /Sign in/);
  unauth.close();
});

// ---------------------------------------------------------------------------------------------
// Coding exercises (needs the AI service running because it hosts the sandbox)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/course_content');
const bank = () => ({
  exercises: JSON.parse(fs.readFileSync(path.join(dataDir, 'exercises.json'), 'utf8')),
  solutions: JSON.parse(fs.readFileSync(path.join(dataDir, 'solutions.json'), 'utf8')),
});

async function allExercises(token) {
  const { exercises } = bank();
  const lessons = [];
  for (const c of (await api('/api/courses', { token })).data.courses) {
    lessons.push(...(await api(`/api/courses/${c.id}`, { token })).data.lessons);
  }
  const found = [];
  for (const l of lessons) {
    for (const e of (await api(`/api/exercises/lesson/${l.id}`, { token })).data.exercises) {
      found.push({ ...e, slug: exercises.find((x) => x.title === e.title).slug });
    }
  }
  return found;
}

test('exercises are listed per lesson and the detail never exposes hidden tests or unrevealed hints', { skip }, async () => {
  const list = await allExercises(student.token);
  assert.equal(list.length, bank().exercises.length);
  const first = list.find((e) => e.slug === 'python-sum-of-evens');
  const res = await api(`/api/exercises/${first.id}`, { token: student.token });
  assert.equal(res.status, 200);
  const text = JSON.stringify(res.data);
  assert.ok(!text.includes('hiddenTests'));
  assert.ok(!text.includes('"hints"'));
  assert.deepEqual(res.data.exercise.hintsShown, []);
  assert.equal(res.data.exercise.hintsTotal, 3);
  assert.ok(res.data.exercise.starter.includes('def sum_of_evens'));
  assert.equal(res.data.exercise.visibleTests.length, 2);
});

test('run checks visible tests only and is not an attempt; submit grades hidden tests too', { skip }, async () => {
  const ex = (await allExercises(student.token)).find((e) => e.slug === 'python-sum-of-evens');
  const sol = bank().solutions[ex.slug];
  const starter = (await api(`/api/exercises/${ex.id}`, { token: student.token })).data.exercise.starter;

  const run = await api(`/api/exercises/${ex.id}/run`, { method: 'POST', token: student.token, body: { code: sol } });
  assert.equal(run.status, 200);
  assert.equal(run.data.status, 'ok');
  assert.equal(run.data.results.length, 2);
  assert.ok(run.data.results.every((r) => r.passed && r.kind === 'visible'));
  assert.equal((await api(`/api/exercises/${ex.id}`, { token: student.token })).data.exercise.attempts, 0);

  // A solution that only handles the visible examples passes Run but fails Submit
  const cheat = 'def sum_of_evens(numbers):\n    return 6 if numbers else 0\n';
  assert.ok((await api(`/api/exercises/${ex.id}/run`, { method: 'POST', token: student.token, body: { code: cheat } })).data.results.every((r) => r.passed));
  const bad = await api(`/api/exercises/${ex.id}/submit`, { method: 'POST', token: student.token, body: { code: cheat } });
  assert.equal(bad.data.solved, false);
  assert.equal(bad.data.newlySolved, false);
  assert.ok(bad.data.results.some((r) => r.kind === 'hidden' && !r.passed));
  assert.ok(!JSON.stringify(bad.data).includes('"expected":12'), 'hidden expected value leaked');

  const before = (await api('/api/auth/me', { token: student.token })).data.user.stats.exercisesSolved;
  const ok = await api(`/api/exercises/${ex.id}/submit`, { method: 'POST', token: student.token, body: { code: sol } });
  assert.equal(ok.data.solved, true);
  assert.equal(ok.data.newlySolved, true);
  assert.equal(ok.data.exercisesSolved, before + 1);
  const again = await api(`/api/exercises/${ex.id}/submit`, { method: 'POST', token: student.token, body: { code: sol } });
  assert.equal(again.data.newlySolved, false);
  assert.equal(again.data.exercisesSolved, before + 1, 'solving twice must not double count');

  const detail = (await api(`/api/exercises/${ex.id}`, { token: student.token })).data.exercise;
  assert.equal(detail.solved, true);
  assert.equal(detail.attempts, 3);
  assert.equal(detail.lastCode, sol);
  assert.ok(starter.length > 0);
});

test('every reference solution is accepted through the real API, database and sandbox', { skip }, async () => {
  const { solutions } = bank();
  for (const ex of await allExercises(student.token)) {
    const r = await api(`/api/exercises/${ex.id}/submit`, { method: 'POST', token: student.token, body: { code: solutions[ex.slug] } });
    assert.equal(r.status, 200, ex.slug);
    assert.equal(r.data.solved, true, `${ex.slug}: ${JSON.stringify(r.data.results.filter((x) => !x.passed))}`);
  }
  const stats = (await api('/api/auth/me', { token: student.token })).data.user.stats;
  assert.equal(stats.exercisesSolved, bank().exercises.length);
});

test('errors are reported usefully: syntax error, runtime error, infinite loop', { skip }, async () => {
  const ex = (await allExercises(student.token)).find((e) => e.slug === 'python-fizzbuzz');
  const run = (code) => api(`/api/exercises/${ex.id}/run`, { method: 'POST', token: student.token, body: { code } });
  const syntax = (await run('def fizzbuzz(n:\n    pass')).data;
  assert.equal(syntax.status, 'error');
  assert.equal(syntax.error.type, 'SyntaxError');
  assert.equal(syntax.error.line, 1);
  const boom = (await run('def fizzbuzz(n):\n    return 1 / 0\n')).data;
  assert.equal(boom.status, 'ok');
  assert.equal(boom.results[0].error.type, 'ZeroDivisionError');
  assert.equal(boom.results[0].error.line, 2);
  const loop = (await run('def fizzbuzz(n):\n    while True:\n        pass\n')).data;
  assert.ok(loop.status === 'timeout' || loop.results.every((r) => r.error?.type === 'Timeout'));
  const printed = (await run('def fizzbuzz(n):\n    print("debug line")\n    return []\n')).data;
  assert.match(printed.stdout, /debug line/);
});

test('hints are revealed one at a time, counted in stats, and run out', { skip }, async () => {
  const ex = (await allExercises(student.token)).find((e) => e.slug === 'ml-mean-squared-error');
  const before = (await api('/api/auth/me', { token: student.token })).data.user.stats.hintRequests;
  const h1 = await api(`/api/exercises/${ex.id}/hint`, { method: 'POST', token: student.token });
  assert.equal(h1.data.hintsUsed, 1);
  assert.equal(h1.data.remaining, 2);
  const h1again = (await api(`/api/exercises/${ex.id}`, { token: student.token })).data.exercise;
  assert.deepEqual(h1again.hintsShown, [h1.data.hint]);
  await api(`/api/exercises/${ex.id}/hint`, { method: 'POST', token: student.token });
  const h3 = await api(`/api/exercises/${ex.id}/hint`, { method: 'POST', token: student.token });
  assert.equal(h3.data.remaining, 0);
  assert.equal((await api(`/api/exercises/${ex.id}/hint`, { method: 'POST', token: student.token })).status, 404);
  assert.equal((await api('/api/auth/me', { token: student.token })).data.user.stats.hintRequests, before + 3);
});

test('exercise input validation and unknown ids', { skip }, async () => {
  const ex = (await allExercises(student.token))[0];
  const post = (p, body) => api(`/api/exercises/${ex.id}/${p}`, { method: 'POST', token: student.token, body });
  assert.equal((await post('run', { code: '' })).status, 400);
  assert.equal((await post('run', {})).status, 400);
  assert.equal((await post('submit', { code: 'x'.repeat(10001) })).status, 400);
  assert.equal((await api('/api/exercises/not-an-id', { token: student.token })).status, 400);
  assert.equal((await api('/api/exercises/00000000-0000-4000-8000-000000000000', { token: student.token })).status, 404);
  assert.equal((await api('/api/exercises/00000000-0000-4000-8000-000000000000/run', { method: 'POST', token: student.token, body: { code: 'x = 1' } })).status, 404);
});
