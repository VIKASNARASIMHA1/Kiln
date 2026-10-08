import { env } from '../config/env.js';
import { LlmError } from './llm/errors.js';
import { createProvider } from './llm/index.js';

export { LlmError };

let provider = null;
let ready = false;

/** The configured provider, or null in demo mode. Misconfiguration throws a clear message. */
function active() {
  if (!ready) {
    provider = createProvider({
      provider: env.llmProvider,
      anthropicKey: env.anthropicKey,
      ollamaUrl: env.ollamaUrl,
      ollamaModel: env.ollamaModel,
      keepAlive: env.ollamaKeepAlive,
      baseUrl: env.llmBaseUrl,
      apiKey: env.llmApiKey,
      model: env.llmModel,
      timeoutMs: env.llmTimeoutMs,
    });
    ready = true;
  }
  return provider;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isLlmEnabled = () => Boolean(active());
export const isLlmLocal = () => Boolean(active()?.local);

export function llmInfo() {
  const p = active();
  return p ? { llm: 'live', provider: p.name, model: p.model, local: p.local } : { llm: 'demo', provider: 'demo', model: null, local: false };
}

/** Loads a local model into memory in the background so the first question is not slow. Returns null if not applicable. */
export async function warmupLlm() {
  const p = active();
  if (!p?.warmup || !env.ollamaWarmup) return null;
  return p.warmup();
}

/** Like llmInfo, but also asks the provider whether it is reachable and the model is installed. */
export async function llmStatus() {
  const p = active();
  const status = p?.status ? await p.status() : { reachable: true };
  return { ...llmInfo(), ...status };
}

/**
 * Streams a chat completion. Calls onToken(text) for each chunk and resolves with the full text.
 * Without a configured model it streams `mockText` instead, so the app works in demo mode.
 */
export async function streamChat({ system, messages, onToken, mockText = '', maxTokens = 700 }) {
  const p = active();
  if (!p) {
    let full = '';
    for (const word of mockText.split(/(\s+)/)) {
      full += word;
      onToken(word);
      if (word.trim()) await sleep(12);
    }
    return full;
  }
  return p.stream({ system, messages, onToken, maxTokens });
}

/** One-shot completion that returns plain text. `json: true` asks providers that support it for valid JSON. */
export async function complete({ system, prompt, maxTokens = 900, json = false, timeoutMs }) {
  const p = active();
  if (!p) throw new LlmError('No language model is configured.', { code: 'demo' });
  return p.complete({ system, prompt, maxTokens, json, timeoutMs });
}

/** Extracts the first JSON object from model output (handles code fences and chatter). */
export function parseJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}
