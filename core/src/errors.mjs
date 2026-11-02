// Errors thrown by the core carry a stable `code` so callers (CLI, desktop) can
// branch on it without parsing the message.
export class StreamsError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'StreamsError';
    this.code = code;
    Object.assign(this, extra);
  }
}
