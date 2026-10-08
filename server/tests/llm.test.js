// Tests for the LLM provider layer against a fake Ollama / OpenAI-compatible server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultReply, startFakeLlm } from './helpers/fakeLlm.js';

const fake = await startFakeLlm();
// The facade reads its settings when first used, so set them before importing it.
process.env.LLM_PROVIDER = 'ollama';
process.env.OLLAMA_URL = fake.url;
process.env.OLLAMA_MODEL = 'llama3.2';

const { createOllama } = await import('../src/services/llm/ollama.js');
const { createOpenAICompat } = await import('../src/services/llm/openaiCompat.js');
const { createProvider } = await import('../src/services/llm/index.js');
const { readLines } = await import('../src/services/llm/lines.js');
const { LlmError } = await import('../src/services/llm/errors.js');
const llm = await import('../src/services/llmService.js');
const agent = await import('../src/services/agentService.js');
const { env } = await import('../src/config/env.js');

test.after(() => fake.close());
test.beforeEach(() => {
  fake.state.mode = 'ok';
  fake.state.reply = defaultReply;
  fake.state.authKey = null;
  fake.state.firstDelayMs = 0;
  fake.state.tokenDelayMs = 0;
  fake.state.loadDelayMs = 0;
  fake.state.requests.length = 0;
  env.quizUseLlm = null;
});
const lastChat = () => [...fake.state.requests].reverse().find((r) => r.url === '/api/chat' || r.url === '/v1/chat/completions');
const ollama = (extra = {}) => createOllama({ baseUrl: fake.url, model: 'llama3.2', timeoutMs: 5000, ...extra });
const rejectsWith = async (promise, code) => {
  const e = await promise.then(() => null, (err) => err);
  assert.ok(e instanceof LlmError, `expected LlmError, got ${e}`);
  assert.equal(e.code, code, e.message);
  return e;
};

test('readLines copes with split lines, CRLF, split multibyte characters and a last line without newline', async () => {
  const enc = new TextEncoder();
  const bytes = enc.encode('{"a":"é"}\r\n{"b":2}\n\n{"c":3}');
  const cut = bytes.indexOf(0xc3) + 1; // split in the middle of "é"
  async function* chunks() { yield bytes.slice(0, 4); yield bytes.slice(4, cut); yield bytes.slice(cut, 15); yield bytes.slice(15); }
  const out = [];
  for await (const l of readLines(chunks())) out.push(l);
  assert.deepEqual(out, ['{"a":"é"}', '{"b":2}', '{"c":3}']);
});

test('ollama: streams tokens, sends the system prompt, history and limits', async () => {
  const tokens = [];
  const full = await ollama().stream({ system: 'Be brief.', messages: [{ role: 'user', content: 'hi' }], maxTokens: 123, onToken: (t) => tokens.push(t) });
  assert.equal(full, 'A list is an ordered, mutable sequence in Python [1].');
  assert.equal(tokens.join(''), full);
  assert.ok(tokens.length > 5, 'arrives in several chunks, including the line that was split in two');
  const b = lastChat().body;
  assert.equal(b.model, 'llama3.2');
  assert.equal(b.stream, true);
  assert.deepEqual(b.messages[0], { role: 'system', content: 'Be brief.' });
  assert.equal(b.messages.at(-1).content, 'hi');
  assert.equal(b.options.num_predict, 123);
  assert.equal(b.keep_alive, '30m', 'asks Ollama to keep the model loaded between questions');
});

test('ollama: JSON mode and non-streaming completion', async () => {
  fake.state.reply = () => '{"ok":true}';
  const text = await ollama().complete({ system: 's', prompt: 'p', json: true });
  assert.equal(text, '{"ok":true}');
  assert.equal(lastChat().body.format, 'json');
  assert.equal(lastChat().body.stream, false);
  await ollama().complete({ system: 's', prompt: 'p' });
  assert.equal(lastChat().body.format, undefined);
});

test('ollama: model not installed gives the exact command to run', async () => {
  fake.state.mode = 'missing';
  const e = await rejectsWith(ollama().stream({ messages: [{ role: 'user', content: 'x' }], onToken() {} }), 'model_missing');
  assert.match(e.userMessage, /ollama pull llama3\.2/);
});

test('ollama: not running gives a friendly message with the address', async () => {
  const dead = createOllama({ baseUrl: 'http://127.0.0.1:1', model: 'llama3.2', timeoutMs: 2000 });
  const e = await rejectsWith(dead.stream({ messages: [{ role: 'user', content: 'x' }], onToken() {} }), 'unreachable');
  assert.match(e.userMessage, /Cannot reach Ollama at http:\/\/127\.0\.0\.1:1/);
  await rejectsWith(dead.complete({ prompt: 'x' }), 'unreachable');
});

test('ollama: server errors, mid-answer failures and garbage lines', async () => {
  fake.state.mode = 'http500';
  const e = await rejectsWith(ollama().complete({ prompt: 'x' }), 'http');
  assert.match(e.userMessage, /500.*terminated/);

  fake.state.mode = 'midstream';
  const got = [];
  await rejectsWith(ollama().stream({ messages: [{ role: 'user', content: 'x' }], onToken: (t) => got.push(t) }), 'stream_error');
  assert.ok(got.length >= 1, 'tokens before the failure were still delivered');

  fake.state.mode = 'badlines';
  const full = await ollama().stream({ messages: [{ role: 'user', content: 'x' }], onToken() {} });
  assert.equal(full, 'A list is an ordered, mutable sequence in Python [1].', 'a non-JSON line is skipped');
});

test('ollama: a model that never answers times out instead of hanging', async () => {
  fake.state.mode = 'hang';
  const t0 = Date.now();
  await rejectsWith(ollama({ timeoutMs: 300 }).stream({ messages: [{ role: 'user', content: 'x' }], onToken() {} }), 'timeout');
  await rejectsWith(ollama({ timeoutMs: 300 }).complete({ prompt: 'x' }), 'timeout');
  assert.ok(Date.now() - t0 < 3000);
});

test('ollama: status reports reachability and whether the model is installed', async () => {
  assert.deepEqual((await ollama().status()).modelInstalled, true); // llama3.2 -> llama3.2:latest
  assert.equal((await ollama({ model: 'qwen2.5:3b' }).status()).modelInstalled, true);
  const st = await ollama({ model: 'mistral' }).status();
  assert.equal(st.reachable, true);
  assert.equal(st.modelInstalled, false);
  assert.deepEqual(st.installedModels, ['llama3.2:latest', 'qwen2.5:3b']);
  const dead = await createOllama({ baseUrl: 'http://127.0.0.1:1', model: 'x', timeoutMs: 1000 }).status();
  assert.equal(dead.reachable, false);
});

test('openai-compatible: streaming, key header, JSON-free completion, local detection', async () => {
  const p = createOpenAICompat({ baseUrl: `${fake.url}/v1`, apiKey: 'secret', model: 'any-model', timeoutMs: 5000 });
  assert.equal(p.local, true);
  fake.state.authKey = 'secret';
  const tokens = [];
  const full = await p.stream({ system: 's', messages: [{ role: 'user', content: 'hi' }], onToken: (t) => tokens.push(t) });
  assert.equal(tokens.join(''), full);
  assert.match(full, /ordered, mutable sequence/);
  assert.equal(lastChat().headers.authorization, 'Bearer secret');
  assert.equal(lastChat().body.model, 'any-model');
  assert.match(await p.complete({ prompt: 'x' }), /ordered/);
  assert.equal((await p.status()).reachable, true);
  fake.state.authKey = null;
  assert.equal(createOpenAICompat({ baseUrl: 'https://api.example.com/v1', model: 'm', timeoutMs: 1 }).local, false);
});

test('openai-compatible: bad key, rate limit and unreachable are explained', async () => {
  const p = createOpenAICompat({ baseUrl: `${fake.url}/v1`, apiKey: 'k', model: 'm', timeoutMs: 3000 });
  fake.state.mode = 'auth';
  assert.match((await rejectsWith(p.complete({ prompt: 'x' }), 'auth')).userMessage, /LLM_API_KEY/);
  fake.state.mode = 'ratelimit';
  assert.match((await rejectsWith(p.stream({ messages: [{ role: 'user', content: 'x' }], onToken() {} }), 'rate_limit')).userMessage, /rate limit/i);
  const dead = createOpenAICompat({ baseUrl: 'http://127.0.0.1:1/v1', model: 'm', timeoutMs: 2000 });
  assert.match((await rejectsWith(dead.complete({ prompt: 'x' }), 'unreachable')).userMessage, /LLM_BASE_URL/);
});

test('createProvider validates settings and applies defaults', () => {
  assert.equal(createProvider({ provider: 'demo' }), null);
  assert.throws(() => createProvider({ provider: 'ollma' }), /Unknown LLM_PROVIDER "ollma"/);
  assert.throws(() => createProvider({ provider: 'anthropic' }), /ANTHROPIC_API_KEY/);
  assert.throws(() => createProvider({ provider: 'openai', baseUrl: 'http://x' }), /LLM_BASE_URL and LLM_MODEL/);
  const o = createProvider({ provider: 'ollama' });
  assert.deepEqual([o.name, o.model, o.local], ['ollama', 'llama3.2', true]);
  assert.equal(createProvider({ provider: 'ollama', ollamaModel: 'qwen2.5:3b' }).model, 'qwen2.5:3b');
  const a = createProvider({ provider: 'anthropic', anthropicKey: 'k' });
  assert.deepEqual([a.name, a.model, a.local], ['anthropic', 'claude-haiku-4-5-20251001', false]);
});

// ---- the facade the rest of the app uses, configured for Ollama through the environment ----
test('facade: reports the provider and streams through it', async () => {
  assert.deepEqual(llm.llmInfo(), { llm: 'live', provider: 'ollama', model: 'llama3.2', local: true });
  assert.equal(llm.isLlmEnabled(), true);
  const tokens = [];
  const text = await llm.streamChat({ system: 's', messages: [{ role: 'user', content: 'x' }], onToken: (t) => tokens.push(t) });
  assert.equal(tokens.join(''), text);
  assert.equal((await llm.llmStatus()).modelInstalled, true);
});

const lesson = { title: 'ML', body: 'Gradient descent adjusts weights to reduce the loss.', questions: [
  { prompt: 'bank q1 prompt', options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'x' },
  { prompt: 'bank q2 prompt', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'x' },
  { prompt: 'bank q3 prompt', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'x' } ] };

test('quiz agent: uses the local model when asked to, asks for JSON and for fewer questions', async () => {
  env.quizUseLlm = true;
  const quiz = await agent.generateQuiz(lesson, 5);
  assert.equal(quiz.source, 'llm');
  assert.equal(quiz.questions.length, 3);
  for (const q of quiz.questions) assert.ok(q.options.length === 4 && q.answer >= 0 && q.answer <= 3);
  const q = quiz.questions.find((x) => /gradient/.test(x.prompt));
  assert.equal(q.options[q.answer], 'The weights', 'answer index follows the shuffled options');
  assert.equal(lastChat().body.format, 'json');
  assert.match(lastChat().body.messages.at(-1).content, /Write 3 multiple-choice questions/);
});

test('quiz agent: unusable model output falls back to the question bank', async () => {
  env.quizUseLlm = true;
  fake.state.reply = () => 'Sure! Here are some questions about gradient descent.';
  assert.equal((await agent.generateQuiz(lesson, 5)).source, 'bank');
  fake.state.reply = () => JSON.stringify({ questions: [{ prompt: 'only one valid question', options: ['a', 'b', 'c', 'd'], answer: 1 }, { prompt: 'bad', options: ['a', 'a'], answer: 9 }] });
  assert.equal((await agent.generateQuiz(lesson, 5)).source, 'bank');
  fake.state.mode = 'http500';
  assert.equal((await agent.generateQuiz(lesson, 5)).source, 'bank');
  fake.state.mode = 'missing';
  assert.equal((await agent.generateQuiz(lesson, 5)).source, 'bank');
});

test('quiz agent: local models use the question bank by default; QUIZ_USE_LLM=0 forces it', async () => {
  for (const setting of [null, false]) {
    env.quizUseLlm = setting;
    const before = fake.state.requests.length;
    assert.equal((await agent.generateQuiz(lesson, 5)).source, 'bank', `quizUseLlm=${setting}`);
    assert.equal(fake.state.requests.length, before, 'the model was not called');
  }
});

test('mistake explanations come from the model, with a fallback to the stored text', async () => {
  const question = { prompt: 'p', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'Stored explanation.' };
  const ok = await agent.explainMistake({ lesson, question, chosenIndex: 0 });
  assert.equal(ok.source, 'llm');
  assert.match(ok.explanation, /re-read the definition/);
  fake.state.mode = 'http500';
  assert.deepEqual(await agent.explainMistake({ lesson, question, chosenIndex: 0 }), { explanation: 'Stored explanation.', source: 'bank' });
});

// ---- timeouts follow progress, not total time ----
const slowOllama = (extra) => createOllama({ baseUrl: fake.url, model: 'llama3.2', timeoutMs: 2000, idleTimeoutMs: 2000, maxTotalMs: 10000, ...extra });
const ask = (p, tokens = []) => p.stream({ messages: [{ role: 'user', content: 'x' }], onToken: (t) => tokens.push(t) });

test('timeouts: a model that is slow to load but then answers is NOT cut off', async () => {
  fake.state.firstDelayMs = 700; // longer than the idle limit would be, but within the start allowance
  const full = await ask(slowOllama({ timeoutMs: 3000, idleTimeoutMs: 400 }));
  assert.match(full, /ordered, mutable sequence/);
});

test('timeouts: a slow but steady answer longer than the start and idle limits is NOT cut off', async () => {
  fake.state.tokenDelayMs = 120; // about 1.3 s in total, while both limits are 400 ms
  const t0 = Date.now();
  const tokens = [];
  const full = await ask(slowOllama({ timeoutMs: 400, idleTimeoutMs: 400, maxTotalMs: 10000 }), tokens);
  assert.ok(Date.now() - t0 > 900, 'the answer really did take longer than either limit');
  assert.equal(tokens.join(''), full);
});

test('timeouts: a model that never starts is stopped with an explanation', async () => {
  fake.state.firstDelayMs = 2500;
  const e = await rejectsWith(ask(slowOllama({ timeoutMs: 300 })), 'timeout');
  assert.match(e.userMessage, /taking too long to start/);
});

test('timeouts: a model that goes silent part-way is stopped, keeping the words already sent', async () => {
  fake.state.mode = 'stall';
  const tokens = [];
  const e = await rejectsWith(ask(slowOllama({ timeoutMs: 2000, idleTimeoutMs: 300 }), tokens), 'timeout');
  assert.match(e.userMessage, /stopped responding/);
  assert.ok(tokens.length >= 1);
});

test('timeouts: a hard cap stops an answer that never ends', async () => {
  fake.state.reply = () => 'word '.repeat(200);
  fake.state.tokenDelayMs = 40;
  const e = await rejectsWith(ask(slowOllama({ timeoutMs: 1000, idleTimeoutMs: 1000, maxTotalMs: 400 })), 'timeout');
  assert.match(e.userMessage, /taking too long, so it was stopped/);
});

test('warm-up loads the model, reports how long it took, and fails politely', async () => {
  fake.state.loadDelayMs = 200;
  const ok = await ollama().warmup();
  assert.equal(ok.ok, true);
  assert.ok(ok.seconds >= 0.15);
  const req = fake.state.requests.find((r) => r.url === '/api/generate');
  assert.deepEqual(req.body, { model: 'llama3.2', keep_alive: '30m' });
  fake.state.mode = 'missing';
  const missing = await ollama().warmup();
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /ollama pull llama3\.2/);
  const dead = await createOllama({ baseUrl: 'http://127.0.0.1:1', model: 'x', timeoutMs: 1000 }).warmup();
  assert.equal(dead.ok, false);
  assert.match(dead.reason, /Cannot reach Ollama/);
});

test('facade: warm-up runs for a local model and is skipped in demo mode or when switched off', async () => {
  assert.equal((await llm.warmupLlm()).ok, true);
  env.ollamaWarmup = false;
  try { assert.equal(await llm.warmupLlm(), null); } finally { env.ollamaWarmup = true; }
});
