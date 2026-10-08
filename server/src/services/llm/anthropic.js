import Anthropic from '@anthropic-ai/sdk';
import { isTimeout, LlmError } from './errors.js';

export function createAnthropic({ apiKey, model, timeoutMs }) {
  const client = new Anthropic({ apiKey });

  function translate(e) {
    if (e instanceof LlmError) return e;
    if (isTimeout(e) || e?.constructor?.name === 'APIConnectionTimeoutError') return new LlmError('The model took too long to answer. Try again.', { code: 'timeout', cause: e });
    const status = e?.status;
    if (status === 401) return new LlmError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.', { code: 'auth', cause: e });
    if (status === 429) return new LlmError('The Anthropic rate limit was reached. Wait a moment and try again.', { code: 'rate_limit', cause: e });
    if (status === 400 && /credit/i.test(e?.message ?? '')) return new LlmError('Your Anthropic account has no credits left. Add credits, or use a free local model (see LLM_PROVIDER).', { code: 'billing', cause: e });
    return new LlmError('The AI model could not answer right now. Try again in a moment.', { code: 'llm_error', cause: e });
  }
  const text = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

  return {
    name: 'anthropic',
    model,
    local: false,

    async stream({ system, messages, onToken, maxTokens = 700 }) {
      try {
        const stream = client.messages.stream({ model, max_tokens: maxTokens, system, messages }, { timeout: timeoutMs });
        stream.on('text', (t) => onToken(t));
        return text(await stream.finalMessage());
      } catch (e) {
        throw translate(e);
      }
    },

    async complete({ system, prompt, maxTokens = 900, timeoutMs: t }) {
      try {
        const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }, { timeout: t ?? timeoutMs });
        return text(res);
      } catch (e) {
        throw translate(e);
      }
    },
  };
}
