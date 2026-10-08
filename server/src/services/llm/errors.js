/** An error whose message is safe and useful to show to a learner. */
export class LlmError extends Error {
  constructor(userMessage, { code = 'llm_error', cause } = {}) {
    super(userMessage);
    this.name = 'LlmError';
    this.userMessage = userMessage;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export const isTimeout = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';
