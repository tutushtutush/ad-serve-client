// The one well-known key the opt-in viewer identifier is kept under (feature 017). Private to this module
// and the tests: nothing else has a reason to read or write it directly.
export const VIEWER_ID_STORAGE_KEY = "adServeViewerId";

// ad-serve-api only accepts a UUID here (anything else it treats as absent), so the SDK refuses anything
// else loudly instead of sending a value that would silently do nothing.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isViewerId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface ViewerIdStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ViewerIdStoreLike {
  /** The kept identifier, created and kept first when there is none; undefined when that cannot be done. */
  getOrCreate(): string | undefined;
  /** Removes the kept identifier. Never throws. */
  remove(): void;
}

/**
 * The SDK's own persistent viewer identifier, only ever built when the platform opted in (feature 017).
 * Everything is inside a try/catch: storage that is absent, blocked or throwing, or no id generator, simply
 * means no identifier. A value that could not be confirmed as persisted is never returned, because the whole
 * point is that a later page load reads the same one back. A stored value that is not a UUID is replaced.
 */
export function createViewerIdStore(
  storage: ViewerIdStorageLike | undefined,
  randomUUIDImpl: (() => string) | undefined,
): ViewerIdStoreLike {
  return {
    getOrCreate() {
      if (!storage) {
        return undefined;
      }
      try {
        const existing = storage.getItem(VIEWER_ID_STORAGE_KEY);
        if (isViewerId(existing)) {
          return existing;
        }
        if (!randomUUIDImpl) {
          return undefined;
        }
        const id = randomUUIDImpl();
        storage.setItem(VIEWER_ID_STORAGE_KEY, id);
        // Two tabs that start together with nothing stored can both create one; the last write wins. Reading it
        // back means this tab keeps the winner instead of an identifier that no longer matches the storage.
        const winner = storage.getItem(VIEWER_ID_STORAGE_KEY);
        return isViewerId(winner) ? winner : id;
      } catch {
        return undefined;
      }
    },

    remove() {
      try {
        storage?.removeItem(VIEWER_ID_STORAGE_KEY);
      } catch {
        // See above: a failing store must never reach the host page.
      }
    },
  };
}
