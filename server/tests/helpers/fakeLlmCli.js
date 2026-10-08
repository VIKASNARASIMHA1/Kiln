// Run a fake Ollama on a port, for trying the app without a real model:  node tests/helpers/fakeLlmCli.js 11434 [firstWordDelayMs] [loadDelayMs]
import { startFakeLlm } from './fakeLlm.js';

const fake = await startFakeLlm({ port: Number(process.argv[2]) || 11434 });
fake.state.tokenDelayMs = 40;
fake.state.firstDelayMs = Number(process.argv[3]) || 0; // pretend the model is slow to load
fake.state.loadDelayMs = Number(process.argv[4]) || 0;
console.log(`Fake Ollama listening on ${fake.url} (not a real model)`);
