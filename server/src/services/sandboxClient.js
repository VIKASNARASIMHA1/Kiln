import { env } from '../config/env.js';
import { HttpError } from '../utils/asyncHandler.js';

/** Sends learner code and tests to the sandboxed runner in the AI service. */
export async function gradeCode({ code, functionName, tests, timeout = 5 }) {
  let res;
  try {
    res = await fetch(`${env.aiServiceUrl}/sandbox/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.sandboxToken ? { 'X-Sandbox-Token': env.sandboxToken } : {}) },
      body: JSON.stringify({ code, function: functionName, tests, timeout }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(503, 'The code runner is not reachable. Make sure the AI service is running.');
  }
  if (res.ok) return res.json();
  const detail = (await res.json().catch(() => ({}))).detail;
  if (res.status === 503) throw new HttpError(503, typeof detail === 'string' ? detail : 'The code runner is unavailable right now.');
  if (res.status === 422) throw new HttpError(400, 'Your code could not be checked. Is it too long?');
  console.error('sandbox error', res.status, detail);
  throw new HttpError(502, 'The code runner returned an error.');
}
