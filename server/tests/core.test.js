import test from 'node:test';
import assert from 'node:assert/strict';
import { bm25Search, chunkText, tokenize } from '../src/services/ragService.js';
import { pickFromBank, shuffleQuestion, validateQuestions, mockTutorAnswer } from '../src/services/agentService.js';
import { parseJsonObject } from '../src/services/llmService.js';
import { touchActivity, recordQuiz } from '../src/utils/stats.js';
import { gradeAnswers } from '../src/routes/quiz.js';
import { validateRegistration } from '../src/routes/auth.js';
import { pickNext } from '../src/routes/recommend.js';
import { aggregateWeekly } from '../src/routes/analytics.js';
import { heuristicRisk } from '../src/services/aiClient.js';
import { createUserLimiter } from '../src/middleware/rateLimit.js';

test('tokenize drops stop words', () => {
  assert.deepEqual(tokenize('What is a Python list?'), ['python', 'list']);
});

test('chunkText keeps code fences intact and respects size', () => {
  const body = '# T\n\nPara one.\n\n```python\na = 1\n\nb = 2\n```\n\n' + 'x '.repeat(400) + '\n\nLast para.';
  const chunks = chunkText(body, 300);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.some((c) => c.includes('a = 1\n\nb = 2')));
});

test('bm25 ranks the relevant chunk first', () => {
  const docs = [
    { title: 'Python', text: 'Python lists and loops for iteration' },
    { title: 'ML', text: 'Gradient descent reduces the loss in neural networks' },
    { title: 'Web', text: 'HTTP status codes like 404 mean not found' },
  ];
  assert.equal(bm25Search(docs, 'how does gradient descent work', 2)[0].doc.title, 'ML');
  assert.equal(bm25Search(docs, 'what does 404 mean', 1)[0].doc.title, 'Web');
  assert.deepEqual(bm25Search(docs, 'zebra unicorn', 3), []);
  assert.deepEqual(bm25Search([], 'anything'), []);
});

test('shuffleQuestion keeps the correct answer correct', () => {
  const q = { prompt: 'Pick b', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'x' };
  for (let i = 0; i < 50; i++) {
    const s = shuffleQuestion(q);
    assert.equal(s.options[s.answer], 'b');
    assert.equal(new Set(s.options).size, 4);
  }
  assert.equal(pickFromBank([q, q, q], 2).length, 2);
});

test('validateQuestions rejects malformed LLM output', () => {
  const good = { prompt: 'What is two plus two?', options: ['1', '2', '3', '4'], answer: 3, explanation: 'math' };
  const out = validateQuestions([
    good,
    { ...good, options: ['1', '1', '3', '4'] },
    { ...good, answer: 4 },
    { ...good, options: ['1', '2', '3'] },
    null,
    { prompt: 'hi' },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(validateQuestions('nope'), []);
});

test('parseJsonObject copes with fences and chatter', () => {
  assert.deepEqual(parseJsonObject('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonObject('no json here'));
});

test('streak logic', () => {
  const day = 86400000;
  const now = new Date('2026-03-10T12:00:00');
  const u = { stats: { streakDays: 3 }, lastActiveAt: new Date(now - day) };
  touchActivity(u, now);
  assert.equal(u.stats.streakDays, 4);
  touchActivity(u, now);
  assert.equal(u.stats.streakDays, 4);
  u.lastActiveAt = new Date(now - 3 * day);
  touchActivity(u, now);
  assert.equal(u.stats.streakDays, 1);
});

test('recordQuiz keeps a running average', () => {
  const u = { stats: { avgQuizScore: 60, quizzesTaken: 1 } };
  recordQuiz(u, 100);
  assert.equal(u.stats.avgQuizScore, 80);
  assert.equal(u.stats.quizzesTaken, 2);
});

test('gradeAnswers', () => {
  const qs = [{ answer: 1, explanation: '' }, { answer: 0, explanation: '' }];
  assert.equal(gradeAnswers(qs, [1, 0]).score, 100);
  assert.equal(gradeAnswers(qs, [1, -1]).score, 50);
  assert.equal(gradeAnswers(qs, [1]), null);
  assert.equal(gradeAnswers(qs, [1, 9]), null);
});

test('registration validation', () => {
  const ok = { name: 'Asha K', email: 'a@b.co', password: 'longenough', track: 'ml' };
  assert.equal(validateRegistration(ok), null);
  assert.match(validateRegistration({ ...ok, password: 'short' }), /8 characters/);
  assert.match(validateRegistration({ ...ok, email: 'nope' }), /email/);
  assert.match(validateRegistration({ ...ok, track: 'cobol' }), /track/);
});

test('pickNext chooses nearest unfinished difficulty', () => {
  const lessons = [
    { id: 'a', difficulty: 1, order: 0 },
    { id: 'b', difficulty: 2, order: 1 },
    { id: 'c', difficulty: 3, order: 2 },
  ];
  assert.equal(pickNext(lessons, new Set(), 3).id, 'c');
  assert.equal(pickNext(lessons, new Set(['c']), 3).id, 'b');
  assert.equal(pickNext(lessons, new Set(['a', 'b', 'c']), 1), null);
});

test('aggregateWeekly averages across students', () => {
  const s = [{ stats: { weeklyEngagement: [10, 20] } }, { stats: { weeklyEngagement: [30, 40] } }, { stats: {} }];
  assert.deepEqual(aggregateWeekly(s), [20, 30]);
  assert.deepEqual(aggregateWeekly([]), []);
});

test('heuristic risk orders sensible learners', () => {
  const hi = heuristicRisk({ daysSinceLastActive: 30, avgQuizScore: 30, streakDays: 0 });
  const lo = heuristicRisk({ daysSinceLastActive: 0, avgQuizScore: 90, streakDays: 7 });
  assert.ok(hi.probability > lo.probability);
  assert.equal(hi.risk, 'high');
  assert.equal(lo.risk, 'low');
});

test('user limiter blocks after max', () => {
  const allow = createUserLimiter(2);
  assert.ok(allow('u') && allow('u'));
  assert.equal(allow('u'), false);
  assert.ok(allow('other'));
});

test('mock tutor answer cites retrieved material or admits none', () => {
  assert.match(mockTutorAnswer([]), /could not find/);
  assert.match(mockTutorAnswer([{ title: 'T', text: 'body text' }]), /\[1\] T/);
});

import { shapeResults, validateCode } from '../src/routes/exercises.js';

test('validateCode rejects empty, huge and NUL input', () => {
  assert.equal(validateCode('x = 1'), 'x = 1');
  assert.throws(() => validateCode('   '), /Write some code/);
  assert.throws(() => validateCode(42), /Write some code/);
  assert.throws(() => validateCode('x'.repeat(10001)), /too long/);
  assert.throws(() => validateCode('a\0b'), /invalid character/);
});

test('shapeResults shows visible tests in full but hides hidden ones', () => {
  const visible = [{ args: [1], expected: 2 }];
  const hidden = [{ args: [99], expected: 'SECRET' }];
  const raw = {
    results: [
      { passed: true, got: '2', error: null },
      { passed: false, got: '"nope"', error: { type: 'KeyError', message: "'99'", line: 3 } },
    ],
    stdout: 'hi',
  };
  const out = shapeResults(raw, visible, hidden);
  assert.equal(out.status, 'ok');
  assert.deepEqual([out.passedCount, out.total], [1, 2]);
  assert.deepEqual(out.results[0].args, [1]);
  assert.equal(out.results[0].expected, 2);
  const hiddenText = JSON.stringify(out.results[1]);
  for (const leak of ['SECRET', '99', 'nope', "'99'"]) assert.ok(!hiddenText.includes(leak), `leaked ${leak}`);
  assert.deepEqual(out.results[1], { kind: 'hidden', label: 'Hidden test 1', passed: false, error: { type: 'KeyError' } });
});

test('shapeResults statuses and missing results', () => {
  assert.equal(shapeResults({ timedOut: true, message: 'slow' }, [], []).status, 'timeout');
  assert.equal(shapeResults({ crashed: true, message: 'bye' }, [], []).status, 'crashed');
  const err = shapeResults({ error: { type: 'SyntaxError', message: 'bad', line: 2 }, results: [] }, [{ args: [], expected: 1 }], []);
  assert.equal(err.status, 'error');
  assert.equal(err.error.line, 2);
  assert.equal(err.results.length, 0);
  const short = shapeResults({ results: [] }, [{ args: [], expected: 1 }], [{ args: [], expected: 2 }]);
  assert.deepEqual(short.results.map((r) => r.passed), [false, false]);
});

import { decodeTests, encodeTests } from '../src/db/content.js';
import { sslFor } from '../src/db/pool.js';

test('test data round-trips through its stored JSON form, including awkward values', () => {
  const tests = [
    { args: [[1, 2, 3]], expected: [[1, 2], [3]] },
    { args: [null], expected: null },
    { args: [''], expected: {} },
    { args: ['x'], expected: { 'a.b': 1, $weird: [] } },
    { args: [], expected: 0.5 },
  ];
  // jsonb stores what JSON.stringify produces, so send the data through JSON as the database driver does
  const stored = JSON.parse(JSON.stringify(encodeTests(tests)));
  assert.deepEqual(decodeTests(stored), tests);
  assert.throws(() => encodeTests([{ args: ['a\u0000b'], expected: 1 }]), /NUL/);
});

test('TLS is on for hosted databases (Neon) and off for local ones', () => {
  assert.deepEqual(sslFor('postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db', null), { rejectUnauthorized: true });
  assert.equal(sslFor('postgresql://u:p@localhost:5432/kiln', null), undefined);
  assert.equal(sslFor('postgresql://u:p@postgres:5432/kiln', null), undefined);
  assert.equal(sslFor('postgresql://u:p@ep-cool-123.neon.tech/db?sslmode=require', null), undefined, 'pg reads sslmode itself');
  assert.equal(sslFor('postgresql://u:p@ep-cool-123.neon.tech/db', false), undefined, 'DATABASE_SSL=0 wins');
  assert.deepEqual(sslFor('postgresql://u:p@localhost/kiln', true), { rejectUnauthorized: true }, 'DATABASE_SSL=1 wins');
});
