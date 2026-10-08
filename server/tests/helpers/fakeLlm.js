// A small fake of the Ollama API (/api/chat, /api/tags) and the OpenAI-compatible API
// (/v1/chat/completions, /v1/models), following their documented formats. Used by the tests
// so the real client code can be exercised without a model. It is NOT a real model.
import http from 'node:http';

const QUIZ_JSON = JSON.stringify({
  questions: [
    { prompt: 'What does gradient descent adjust to reduce the loss?', options: ['The weights', 'The dataset', 'The file names', 'The font size'], answer: 0, explanation: 'It nudges the weights to lower the loss.' },
    { prompt: 'Which task predicts a number?', options: ['Classification', 'Regression', 'Clustering', 'Tokenisation'], answer: 1, explanation: 'Regression predicts continuous values.' },
    { prompt: 'Why keep a separate test set?', options: ['To train faster', 'To measure performance on unseen data', 'To reduce features', 'To label data'], answer: 1, explanation: 'It estimates generalisation.' },
  ],
});

export function defaultReply(body) {
  const text = (body.messages ?? []).map((m) => `${m.role}: ${m.content}`).join('\n');
  if (/multiple-choice/.test(text)) return QUIZ_JSON;
  if (/patient tutor/.test(text)) return 'You picked a plausible option, but the lesson says the opposite: re-read the definition and try again.';
  return 'A list is an ordered, mutable sequence in Python [1].';
}

export async function startFakeLlm({ port = 0 } = {}) {
  const state = { mode: 'ok', requests: [], reply: defaultReply, models: ['llama3.2:latest', 'qwen2.5:3b'], tokenDelayMs: 0, firstDelayMs: 0, loadDelayMs: 0, authKey: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = new Set();

  const server = http.createServer(async (req, res) => {
    open.add(res);
    res.on('close', () => open.delete(res));
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    state.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const tokens = () => state.reply(body).split(/(?<= )/); // keep the spaces inside the tokens

    if (req.method === 'GET' && req.url === '/api/tags') return json(200, { models: state.models.map((name) => ({ name })) });
    if (req.method === 'GET' && req.url === '/v1/models') return state.mode === 'auth' ? json(401, { error: { message: 'bad key' } }) : json(200, { data: [{ id: 'm' }] });

    if (req.url === '/api/generate') { // Ollama loads the model when sent an empty request
      if (state.mode === 'missing') return json(404, { error: `model "${body.model}" not found, try pulling it first` });
      await sleep(state.loadDelayMs);
      return json(200, { model: body.model, response: '', done: true });
    }

    if (req.url === '/api/chat') {
      if (state.mode === 'missing') return json(404, { error: `model "${body.model}" not found, try pulling it first` });
      if (state.mode === 'http500') return json(500, { error: 'llama runner process has terminated: exit status 2' });
      if (state.mode === 'hang') return; // never answers
      if (body.stream === false) return json(200, { model: body.model, message: { role: 'assistant', content: state.reply(body) }, done: true });
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.flushHeaders();
      await sleep(state.firstDelayMs); // the model is still loading
      const parts = tokens();
      if (state.mode === 'badlines') res.write('this is not json\n');
      for (const [i, t] of parts.entries()) {
        const line = JSON.stringify({ model: body.model, message: { role: 'assistant', content: t }, done: false }) + '\n';
        if (i === 0) { // split the first line across two network writes
          res.write(line.slice(0, 20)); await sleep(15); res.write(line.slice(20));
        } else res.write(line);
        if (state.mode === 'stall' && i === 1) return; // goes silent and never finishes
        if (state.mode === 'midstream' && i === 1) { res.write(JSON.stringify({ error: 'out of memory' }) + '\n'); return res.end(); }
        if (state.tokenDelayMs) await sleep(state.tokenDelayMs);
      }
      res.write(JSON.stringify({ model: body.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }) + '\n');
      return res.end();
    }

    if (req.url === '/v1/chat/completions') {
      if (state.mode === 'auth' || (state.authKey && req.headers.authorization !== `Bearer ${state.authKey}`)) return json(401, { error: { message: 'Incorrect API key provided' } });
      if (state.mode === 'ratelimit') return json(429, { error: { message: 'Rate limit reached' } });
      if (body.stream === false) return json(200, { choices: [{ message: { role: 'assistant', content: state.reply(body) } }] });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const t of tokens()) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
        if (state.tokenDelayMs) await sleep(state.tokenDelayMs);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    json(404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actualPort = server.address().port;
  return {
    state,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () => new Promise((resolve) => { for (const r of open) r.destroy(); server.close(resolve); }),
  };
}
