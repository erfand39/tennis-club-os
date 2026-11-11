export class InputError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
