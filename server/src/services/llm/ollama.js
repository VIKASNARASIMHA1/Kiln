import { isTimeout, LlmError } from './errors.js';
import { readLines } from './lines.js';

const SLOW_START = 'The model is taking too long to start (it may still be loading). Wait a minute and ask again, or switch to a smaller model with OLLAMA_MODEL.';
const STALLED = 'The model stopped responding part-way through. Ask again, or switch to a smaller model with OLLAMA_MODEL.';
const TOO_LONG = 'The answer was taking too long, so it was stopped. Ask a shorter question, or switch to a smaller model with OLLAMA_MODEL.';
const GENERIC_TIMEOUT = 'The model took too long to answer. Try again, or use a smaller model (see OLLAMA_MODEL).';

/**
 * Ollama (https://ollama.com) runs open models on your own computer, free and offline.
 * Uses its native /api/chat endpoint: newline-delimited JSON when streaming.
 *
 * Streaming timeouts are about progress, not total time, because a slow computer can be working
 * correctly for minutes:
 *   timeoutMs      how long to wait for the FIRST word (the model may still be loading into memory)
 *   idleTimeoutMs  how long it may go silent once it has started
 *   maxTotalMs     a hard cap on one answer
 */
export function createOllama({ baseUrl, model, timeoutMs, idleTimeoutMs = 60_000, maxTotalMs = 900_000, keepAlive = '30m' }) {
  const url = baseUrl.replace(/\/+$/, '');

  const timeoutFor = (e) => new LlmError(e?.phase === 'stream' ? STALLED : e?.phase === 'max' ? TOO_LONG : e?.phase === 'start' ? SLOW_START : GENERIC_TIMEOUT, { code: 'timeout', cause: e });

  async function post(path, body, signal) {
    let res;
    try {
      res = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (isTimeout(e)) throw timeoutFor(e);
      throw new LlmError(`Cannot reach Ollama at ${url}. Start the Ollama app, then try again.`, { code: 'unreachable', cause: e });
    }
    if (!res.ok) throw await httpError(res);
    return res;
  }

  async function httpError(res) {
    const text = await res.text().catch(() => '');
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text).error ?? message;
    } catch {
      /* not JSON */
    }
    if (res.status === 404 && /not found/i.test(message)) {
      return new LlmError(`The model "${model}" is not installed. Run: ollama pull ${model}`, { code: 'model_missing' });
    }
    return new LlmError(`Ollama returned an error (${res.status}): ${message || 'no details'}`, { code: 'http' });
  }

  const chatBody = ({ system, messages, maxTokens, json, stream }) => ({
    model,
    stream,
    keep_alive: keepAlive, // keep the model in memory between questions so only the first one is slow
    ...(json ? { format: 'json' } : {}),
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    options: { temperature: 0.3, num_predict: maxTokens },
  });

  return {
    name: 'ollama',
    model,
    local: true,

    async stream({ system, messages, onToken, maxTokens = 700 }) {
      const ctrl = new AbortController();
      let phase = 'start';
      let idle;
      const abortWith = (p) => ctrl.abort(Object.assign(new Error(`timeout (${p})`), { name: 'TimeoutError', phase: p }));
      const arm = (ms) => {
        clearTimeout(idle);
        idle = setTimeout(() => abortWith(phase), ms);
      };
      const hard = setTimeout(() => abortWith('max'), maxTotalMs);
      arm(timeoutMs);
      let full = '';
      try {
        const res = await post('/api/chat', chatBody({ system, messages, maxTokens, stream: true }), ctrl.signal);
        for await (const line of readLines(res.body)) {
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue; // ignore anything that is not a JSON line
          }
          if (obj.error) throw new LlmError(`Ollama stopped with an error: ${obj.error}`, { code: 'stream_error' });
          const text = obj.message?.content;
          if (text) {
            full += text;
            onToken(text);
            phase = 'stream';
          }
          arm(idleTimeoutMs);
          if (obj.done) break;
        }
      } catch (e) {
        if (e instanceof LlmError) throw e;
        if (isTimeout(e)) throw timeoutFor(e);
        throw new LlmError('The connection to Ollama was interrupted.', { code: 'interrupted', cause: e });
      } finally {
        clearTimeout(idle);
        clearTimeout(hard);
      }
      return full;
    },

    /** Non-streaming. `timeoutMs` here is a hard cap on the whole call. */
    async complete({ system, prompt, maxTokens = 900, json = false, timeoutMs: cap }) {
      const body = chatBody({ system, messages: [{ role: 'user', content: prompt }], maxTokens, json, stream: false });
      const res = await post('/api/chat', body, AbortSignal.timeout(cap ?? timeoutMs));
      try {
        return (await res.json()).message?.content ?? '';
      } catch (e) {
        if (isTimeout(e)) throw timeoutFor(e);
        throw new LlmError('Ollama sent a reply that could not be read.', { code: 'bad_response', cause: e });
      }
    },

    /** Loads the model into memory ahead of the first question (an empty request, no answer is generated). */
    async warmup() {
      const started = Date.now();
      try {
        const res = await post('/api/generate', { model, keep_alive: keepAlive }, AbortSignal.timeout(maxTotalMs));
        await res.json().catch(() => null);
        return { ok: true, seconds: (Date.now() - started) / 1000 };
      } catch (e) {
        return { ok: false, reason: e.userMessage || e.message };
      }
    },

    /** Is the server up, and is the chosen model installed? */
    async status() {
      try {
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return { reachable: true, modelInstalled: false, installedModels: [] };
        const names = ((await res.json()).models ?? []).map((m) => m.name);
        const wanted = model.includes(':') ? model : `${model}:latest`;
        return { reachable: true, modelInstalled: names.includes(wanted), installedModels: names };
      } catch {
        return { reachable: false, modelInstalled: false, installedModels: [] };
      }
    },
  };
}
