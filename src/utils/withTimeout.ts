/**
 * Runs `fn` with an AbortSignal that fires after `ms` milliseconds, so a
 * hung operation can actually be cancelled (not just ignored) once its
 * budget runs out. Generic — no knowledge of what `fn` does.
 */
export function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  // fn is called synchronously (not deferred via .then) so it can attach an
  // abort listener before the timer has any chance to fire first. The
  // try/catch exists only to convert a synchronous throw from fn into a
  // rejection, so .finally still runs and the timer doesn't leak.
  let pending: Promise<T>;
  try {
    pending = fn(controller.signal);
  } catch (error) {
    clearTimeout(timer);
    return Promise.reject(error);
  }

  return pending.finally(() => clearTimeout(timer));
}
