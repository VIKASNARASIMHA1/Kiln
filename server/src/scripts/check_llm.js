// Usage: npm run check:llm
// Tells you whether your language model is set up correctly, and how fast it answers.
import { env } from '../config/env.js';
import { llmInfo, llmStatus, streamChat } from '../services/llmService.js';

const hint = {
  unreachable: 'Start the model service. For Ollama on Windows, open the Ollama app (it runs in the system tray), then try again.',
  model_missing: 'Download the model once with the "ollama pull" command shown above.',
  auth: 'Check the API key in your .env file.',
  rate_limit: 'You hit the service limit. Wait a minute or switch model.',
  timeout: 'The model is too slow for this computer. Try a smaller model, or raise LLM_TIMEOUT_MS.',
};

async function main() {
  let info;
  try {
    info = llmInfo();
  } catch (e) {
    console.log(`Configuration problem: ${e.message}`);
    process.exit(1);
  }
  if (info.llm === 'demo') {
    console.log('Demo mode: no language model is configured.');
    console.log('To use a free local model: install Ollama, run "ollama pull llama3.2", then set LLM_PROVIDER=ollama in .env.');
    return;
  }
  console.log(`Provider: ${info.provider}   Model: ${info.model}   ${info.local ? '(runs on this computer)' : '(remote service)'}`);
  if (info.provider === 'ollama') console.log(`Ollama URL: ${env.ollamaUrl}`);

  const status = await llmStatus();
  if (status.reachable === false) {
    console.log('FAIL: cannot reach the model service.');
    console.log(hint.unreachable);
    process.exit(1);
  }
  if (info.provider === 'ollama' && !status.modelInstalled) {
    console.log(`FAIL: Ollama is running but the model "${info.model}" is not installed.`);
    console.log(`Run: ollama pull ${info.model}`);
    if (status.installedModels?.length) console.log(`Installed models: ${status.installedModels.join(', ')}  (set OLLAMA_MODEL to one of these)`);
    process.exit(1);
  }
  console.log('Service reachable. Asking a test question (the first answer can take a while while the model loads)...');

  const started = Date.now();
  let first = null;
  try {
    const answer = await streamChat({
      system: 'You are a helpful tutor. Answer in one short sentence.',
      messages: [{ role: 'user', content: 'What is a Python list?' }],
      maxTokens: 60,
      onToken: () => (first ??= Date.now() - started),
    });
    console.log(`OK. First word after ${first} ms, full answer after ${Date.now() - started} ms.`);
    console.log(`Answer: ${answer.trim()}`);
    if (first > 60_000) console.log('This computer is slow with this model. Consider a smaller one: ollama pull llama3.2:1b, then set OLLAMA_MODEL=llama3.2:1b in .env.');
  } catch (e) {
    console.log(`FAIL: ${e.userMessage || e.message}`);
    if (hint[e.code]) console.log(hint[e.code]);
    process.exit(1);
  }
}

main();
