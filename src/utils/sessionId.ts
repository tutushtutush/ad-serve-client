// The one well-known key this SDK stores its session identifier under — private to this module,
// since no other module has a reason to read or write it directly (016/data-model.md).
const SESSION_STORAGE_KEY = "adServeSessionId";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads back an already-persisted visitor session identifier, or originates and persists a new
 * one when none exists — or `undefined` when storage/the id generator is unavailable, the stored
 * value is empty, or any step throws. A single try/catch wraps the whole read-or-create-and-
 * persist sequence: a value this function can't also confirm was persisted is never returned,
 * since a later page load reading it back is the entire point (research.md Decision 4) — there is
 * no partial-success case where a freshly-generated-but-unpersisted id is still handed back.
 */
export function getOrCreateSessionId(
  storage: SessionStorageLike | undefined,
  randomUUIDImpl: (() => string) | undefined,
): string | undefined {
  if (!storage || !randomUUIDImpl) {
    return undefined;
  }
  try {
    const existing = storage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const id = randomUUIDImpl();
    storage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}
