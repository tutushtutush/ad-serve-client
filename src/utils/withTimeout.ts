/**
 * Runs `fn` with an AbortSignal that fires after `ms` milliseconds, so a
 * hung operation can actually be cancelled (not just ignored) once its
 * budget runs out. Generic — no knowledge of what `fn` does.
 */
export function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fn(controller.signal).finally(() => clearTimeout(timer));
}
