import { createAnthropic } from './anthropic.js';
import { createOllama } from './ollama.js';
import { createOpenAICompat } from './openaiCompat.js';

export const PROVIDERS = ['demo', 'anthropic', 'ollama', 'openai'];

/**
 * Builds the LLM provider from configuration. Returns null for demo mode.
 * Throws a clear message if the settings are incomplete, so a typo fails at startup, not mid-lesson.
 */
export function createProvider(cfg) {
  switch (cfg.provider) {
    case 'demo':
      return null;
    case 'anthropic':
      if (!cfg.anthropicKey) throw new Error('LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
      return createAnthropic({ apiKey: cfg.anthropicKey, model: cfg.model || 'claude-haiku-4-5-20251001', timeoutMs: cfg.timeoutMs || 60_000 });
    case 'ollama':
      return createOllama({ baseUrl: cfg.ollamaUrl || 'http://127.0.0.1:11434', model: cfg.ollamaModel || cfg.model || 'llama3.2', timeoutMs: cfg.timeoutMs || 180_000, keepAlive: cfg.keepAlive || '30m' });
    case 'openai':
      if (!cfg.baseUrl || !cfg.model) throw new Error('LLM_PROVIDER=openai needs LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY for hosted services).');
      return createOpenAICompat({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, timeoutMs: cfg.timeoutMs || 60_000 });
    default:
      throw new Error(`Unknown LLM_PROVIDER "${cfg.provider}". Use one of: ${PROVIDERS.join(', ')}.`);
  }
}
