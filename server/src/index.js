import http from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './db/pool.js';
import { seedIfEmpty } from './db/seed.js';
import { env } from './config/env.js';
import { attachSockets } from './sockets/index.js';
import { llmInfo, warmupLlm } from './services/llmService.js';

async function main() {
  const llm = llmInfo(); // throws a clear message if the LLM settings are incomplete
  await connectDb(); // also creates the tables on first run
  if (env.autoSeed) await seedIfEmpty();
  const server = http.createServer(createApp());
  attachSockets(server);
  server.listen(env.port, () => {
    console.log(`Kiln API on :${env.port} | LLM: ${llm.llm === 'live' ? `${llm.provider} (${llm.model})${llm.local ? ', runs on this computer' : ''}` : 'demo mode (set LLM_PROVIDER to enable a model)'}`);
    if (llm.llm === 'live' && llm.local) {
      console.log(`Loading ${llm.model} into memory in the background. The first answer is fast once this finishes (it can take a minute or two).`);
      warmupLlm().then((r) => r && console.log(r.ok ? `Model ready (loaded in ${r.seconds.toFixed(1)} s).` : `Model warm-up did not finish: ${r.reason}`));
    }
  });
}

main().catch((e) => {
  console.error('Failed to start:', e.message);
  process.exit(1);
});
