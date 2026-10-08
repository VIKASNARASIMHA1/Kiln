// The whole app with a (fake) Ollama as its language model: real HTTP API, real Socket.io, real database.
// Needs TEST_DATABASE_URL pointing at a seeded database.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { startFakeLlm } from './helpers/fakeLlm.js';

const URI = process.env.TEST_DATABASE_URL;
const skip = !URI && 'set TEST_DATABASE_URL to run integration tests';

let fake, server, base, token;

async function api(path, { method = 'GET', body, tok = token } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}

test.before(async () => {
  if (!URI) return;
  fake = await startFakeLlm();
  process.env.DATABASE_URL = URI;
  process.env.LLM_PROVIDER = 'ollama';
  process.env.OLLAMA_URL = fake.url;
  process.env.OLLAMA_MODEL = 'llama3.2';
  process.env.QUIZ_USE_LLM = '1'; // local models default to the question bank; opt in to test the AI path
  const { connectDb } = await import('../src/db/pool.js');
  const { createApp } = await import('../src/app.js');
  const { attachSockets } = await import('../src/sockets/index.js');
  await connectDb();
  server = http.createServer(createApp());
  attachSockets(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const email = `llm${Date.now()}@example.com`;
  token = (await api('/api/auth/register', { method: 'POST', tok: null, body: { name: 'Local Model Tester', email, password: 'password123', track: 'ml' } })).data.token;
});
test.after(async () => {
  if (!URI) return;
  server.closeAllConnections?.();
  server.close();
  await fake.close().catch(() => {});
  (await import('../src/db/pool.js')).closeDb();
});

async function ask(question) {
  const sock = connect(base, { auth: { token }, transports: ['websocket'] });
  await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
  const out = { tokens: [], sources: [], error: null, done: false };
  const finished = new Promise((res) => {
    sock.on('tutor:start', (d) => (out.sources = d.sources));
    sock.on('tutor:token', (d) => out.tokens.push(d.text));
    sock.on('tutor:done', () => { out.done = true; res(); });
    sock.on('tutor:error', (d) => { out.error = d.message; res(); });
  });
  sock.emit('tutor:ask', { question });
  await finished;
  sock.close();
  return out;
}

async function firstLessonId() {
  const courses = (await api('/api/courses')).data.courses;
  const ml = courses.find((c) => c.track === 'ml');
  return (await api(`/api/courses/${ml.id}`)).data.lessons[2].id; // the neural networks lesson
}

test('health shows the provider and model in use', { skip }, async () => {
  const h = (await api('/api/health', { tok: null })).data;
  assert.deepEqual(h, { status: 'ok', llm: 'live', provider: 'ollama', model: 'llama3.2', local: true });
  const st = (await api('/api/llm/status')).data;
  assert.equal(st.reachable, true);
  assert.equal(st.modelInstalled, true);
  assert.equal((await api('/api/llm/status', { tok: null })).status, 401);
});

test('tutor: streams the local model answer with sources, and saves the conversation', { skip }, async () => {
  fake.state.requests.length = 0;
  const out = await ask('What does gradient descent do?');
  assert.equal(out.error, null);
  assert.ok(out.done);
  assert.ok(out.tokens.length > 5, 'arrives token by token');
  assert.equal(out.tokens.join(''), 'A list is an ordered, mutable sequence in Python [1].');
  assert.match(out.sources[0].title, /Neural networks/);
  // the prompt sent to the model carried the retrieved lesson passage and the question
  const prompt = fake.state.requests.find((r) => r.url === '/api/chat').body.messages.at(-1).content;
  assert.match(prompt, /Course excerpts:/);
  assert.match(prompt, /gradient descent/i);
  const sessions = (await api('/api/tutor/sessions')).data.sessions;
  assert.ok(sessions.length >= 1);
});

test('quiz: AI-written questions from the local model, graded server-side, with model explanations', { skip }, async () => {
  const lessonId = await firstLessonId();
  const gen = await api('/api/quiz/generate', { method: 'POST', body: { lessonId } });
  assert.equal(gen.status, 201);
  assert.equal(gen.data.source, 'llm');
  assert.equal(gen.data.questions.length, 3);
  assert.ok(gen.data.questions.every((q) => q.answer === undefined), 'answers are not sent to the browser');
  const sub = await api(`/api/quiz/${gen.data.attemptId}/submit`, { method: 'POST', body: { answers: [0, 0, 0] } });
  assert.equal(sub.status, 200);
  assert.ok(sub.data.results.every((r) => typeof r.explanation === 'string' && r.explanation.length > 5));
  const ex = await api('/api/quiz/explain', { method: 'POST', body: { attemptId: gen.data.attemptId, questionIndex: 0 } });
  assert.equal(ex.data.source, 'llm');
  assert.match(ex.data.explanation, /re-read the definition/);
});

test('quiz: if the model returns nonsense the learner still gets a quiz from the question bank', { skip }, async () => {
  fake.state.reply = () => 'I cannot do that, sorry.';
  const gen = await api('/api/quiz/generate', { method: 'POST', body: { lessonId: await firstLessonId() } });
  assert.equal(gen.status, 201);
  assert.equal(gen.data.source, 'bank');
  assert.equal(gen.data.questions.length, 3);
});

test('model not installed: the tutor says exactly what to run, and quizzes still work', { skip }, async () => {
  fake.state.mode = 'missing';
  const out = await ask('hello there');
  assert.equal(out.done, false);
  assert.match(out.error, /ollama pull llama3\.2/);
  const gen = await api('/api/quiz/generate', { method: 'POST', body: { lessonId: await firstLessonId() } });
  assert.equal(gen.data.source, 'bank');
});

test('Ollama stopped: friendly tutor message, quizzes and exercises keep working', { skip }, async () => {
  fake.state.mode = 'ok';
  await fake.close();
  const out = await ask('are you there?');
  assert.match(out.error, /Cannot reach Ollama/);
  const gen = await api('/api/quiz/generate', { method: 'POST', body: { lessonId: await firstLessonId() } });
  assert.equal(gen.status, 201);
  assert.equal(gen.data.source, 'bank');
  const st = (await api('/api/llm/status')).data;
  assert.equal(st.reachable, false);
  assert.equal((await api('/api/health', { tok: null })).data.status, 'ok', 'the app itself stays healthy');
});
