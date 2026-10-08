import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env'), quiet: true });
dotenv.config({ quiet: true });

// Render hands over "host:port" for private-network services, so add the scheme when it is missing.
const withScheme = (u) => (/^https?:\/\//i.test(u) ? u : `http://${u}`).replace(/\/+$/, '');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  // Postgres connection string. On Neon, copy it from the dashboard (Connect > pooled connection).
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kiln',
  // DATABASE_SSL=0 turns TLS off, =1 forces it. Empty = automatic (on for anything that is not local).
  databaseSsl: process.env.DATABASE_SSL ? !['0', 'false', 'no'].includes(process.env.DATABASE_SSL.toLowerCase()) : null,
  // Load the courses, lessons and demo learners on start-up when the database is empty (used on Render).
  autoSeed: ['1', 'true', 'yes'].includes((process.env.AUTO_SEED || '').toLowerCase()),
  // Built React app. When this folder exists the API serves it too, so one web service runs the whole site.
  clientDist: process.env.CLIENT_DIST || path.resolve(here, '../../../client/dist'),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  // demo (no model), anthropic, ollama (free, runs on your computer) or openai (any OpenAI-compatible service)
  llmProvider: (process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'demo')).toLowerCase(),
  llmModel: process.env.LLM_MODEL || '',
  llmBaseUrl: process.env.LLM_BASE_URL || '',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 0, // 0 = provider default
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || '',
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || '30m',
  ollamaWarmup: !['0', 'false', 'no'].includes((process.env.OLLAMA_WARMUP || '1').toLowerCase()),
  // null = decide automatically: AI-written quizzes with hosted models, the question bank with slow local ones
  quizUseLlm: process.env.QUIZ_USE_LLM ? !['0', 'false', 'no'].includes(process.env.QUIZ_USE_LLM.toLowerCase()) : null,
  aiServiceUrl: withScheme(process.env.AI_SERVICE_URL || 'http://localhost:8000'),
  dataDir: process.env.DATA_DIR || path.resolve(here, '../../../data'),
  sandboxToken: process.env.SANDBOX_TOKEN || '',
  runLimitPer10Min: Number(process.env.RUN_LIMIT_PER_10_MIN) || 40,
  tutorLimitPer10Min: Number(process.env.TUTOR_LIMIT_PER_10_MIN) || 20,
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'dev-secret-change-me') {
  throw new Error('Set JWT_SECRET before running in production.');
}
