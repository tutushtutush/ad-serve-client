// The one well-known key this SDK stores its session identifier under — private to this module,
// since no other module has a reason to read or write it directly (016/data-model.md).
const SESSION_STORAGE_KEY = "adServeSessionId";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads back an already-persisted visitor session identifier, or originates and persists a new
 * one when none exists — or `undefined` when storage is unavailable, the stored value is empty
 * with no id generator available to originate a replacement, or any step throws. A single
 * try/catch wraps the whole read-or-create-and-persist sequence: a value this function can't also
 * confirm was persisted is never returned, since a later page load reading it back is the entire
 * point (research.md Decision 4) — there is no partial-success case where a
 * freshly-generated-but-unpersisted id is still handed back.
 *
 * `randomUUIDImpl`'s availability only gates *originating* a new id — an already-persisted value
 * is always read back and returned regardless of whether a generator is available this call,
 * since reading never needs one (FR-002 is not conditioned on generator availability; caught in
 * code review — an earlier version bailed out before ever checking storage whenever
 * `randomUUIDImpl` was absent, silently dropping an existing session id).
 */
export function getOrCreateSessionId(
  storage: SessionStorageLike | undefined,
  randomUUIDImpl: (() => string) | undefined,
): string | undefined {
  if (!storage) {
    return undefined;
  }
  try {
    const existing = storage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    if (!randomUUIDImpl) {
      return undefined;
    }
    const id = randomUUIDImpl();
    storage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}
