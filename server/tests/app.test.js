// Boots the real Express app without a database to check wiring, auth gates and validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

let server, base;
test.before(async () => {
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = (path, opts = {}) =>
  fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });

test('health reports demo mode without a key', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok', llm: 'demo', provider: 'demo', model: null, local: false });
});

test('protected routes require a token', async () => {
  for (const p of ['/api/courses', '/api/progress', '/api/recommend/next', '/api/analytics/overview', '/api/tutor/sessions', '/api/llm/status', '/api/exercises/lesson/abc', '/api/exercises/abc']) {
    const r = await call(p);
    assert.equal(r.status, 401, p);
  }
});

test('bad token is rejected', async () => {
  const r = await call('/api/courses', { headers: { Authorization: 'Bearer nonsense' } });
  assert.equal(r.status, 401);
});

test('registration validates before touching the database', async () => {
  const r = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'A', email: 'x', password: '1' }) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /name/i);
});

test('login validates input', async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(r.status, 400);
});

test('unknown routes return json 404', async () => {
  const r = await call('/api/nope');
  assert.equal(r.status, 404);
  assert.ok((await r.json()).error);
});
