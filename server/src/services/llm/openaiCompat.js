import { isTimeout, LlmError } from './errors.js';
import { readLines } from './lines.js';

/**
 * Any service that speaks the OpenAI chat-completions format: LM Studio, llama.cpp's server,
 * Ollama's /v1 endpoint, and hosted services (some have free tiers; check their current limits).
 */
export function createOpenAICompat({ baseUrl, apiKey, model, timeoutMs }) {
  const url = baseUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };

  const timeoutError = (cause) => new LlmError('The model took too long to answer. Try again.', { code: 'timeout', cause });

  async function post(body, signal) {
    let res;
    try {
      res = await fetch(`${url}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (e) {
      if (isTimeout(e)) throw timeoutError(e);
      throw new LlmError(`Cannot reach the LLM service at ${url}. Check LLM_BASE_URL and that the service is running.`, { code: 'unreachable', cause: e });
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      detail = j.error?.message ?? j.error ?? detail;
    } catch {
      /* not JSON */
    }
    if (res.status === 401 || res.status === 403) throw new LlmError('The LLM service rejected the API key. Check LLM_API_KEY.', { code: 'auth' });
    if (res.status === 429) throw new LlmError('The LLM service rate limit was reached. Wait a moment, or switch to another model.', { code: 'rate_limit' });
    if (res.status === 404) throw new LlmError(`The service did not recognise the model "${model}" or the URL. Check LLM_MODEL and LLM_BASE_URL.`, { code: 'not_found' });
    throw new LlmError(`The LLM service returned an error (${res.status}): ${detail || 'no details'}`, { code: 'http' });
  }

  const body = ({ system, messages, maxTokens, stream }) => ({
    model,
    stream,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
  });

  return {
    name: 'openai',
    model,
    local: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url),

    async stream({ system, messages, onToken, maxTokens = 700 }) {
      const res = await post(body({ system, messages, maxTokens, stream: true }), AbortSignal.timeout(timeoutMs));
      let full = '';
      try {
        for await (const line of readLines(res.body)) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break;
          let obj;
          try {
            obj = JSON.parse(data);
          } catch {
            continue;
          }
          const text = obj.choices?.[0]?.delta?.content;
          if (text) {
            full += text;
            onToken(text);
          }
        }
      } catch (e) {
        if (isTimeout(e)) throw timeoutError(e);
        throw new LlmError('The connection to the LLM service was interrupted.', { code: 'interrupted', cause: e });
      }
      return full;
    },

    async complete({ system, prompt, maxTokens = 900, timeoutMs: t }) {
      const res = await post(body({ system, messages: [{ role: 'user', content: prompt }], maxTokens, stream: false }), AbortSignal.timeout(t ?? timeoutMs));
      try {
        return (await res.json()).choices?.[0]?.message?.content ?? '';
      } catch (e) {
        if (isTimeout(e)) throw timeoutError(e);
        throw new LlmError('The LLM service sent a reply that could not be read.', { code: 'bad_response', cause: e });
      }
    },

    async status() {
      try {
        const res = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(3000) });
        return { reachable: res.status < 500, authOk: res.status !== 401 && res.status !== 403 };
      } catch {
        return { reachable: false };
      }
    },
  };
}
