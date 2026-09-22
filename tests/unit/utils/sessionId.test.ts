import { getOrCreateSessionId } from "../../../src/utils/sessionId";
import type { SessionStorageLike } from "../../../src/utils/sessionId";

function createFakeStorage(overrides: Partial<SessionStorageLike> = {}): SessionStorageLike {
  return {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    ...overrides,
  };
}

describe("getOrCreateSessionId", () => {
  describe("US1 — persisted across page loads", () => {
    it("originates and persists a fresh id when nothing is stored", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue(null) });
      const randomUUIDImpl = jest.fn().mockReturnValue("11111111-1111-1111-1111-111111111111");

      const result = getOrCreateSessionId(storage, randomUUIDImpl);

      expect(result).toBe("11111111-1111-1111-1111-111111111111");
      expect(storage.setItem).toHaveBeenCalledWith(
        "adServeSessionId",
        "11111111-1111-1111-1111-111111111111",
      );
    });

    it("reads back an already-persisted id, never regenerating or re-persisting", () => {
      const storage = createFakeStorage({
        getItem: jest.fn().mockReturnValue("22222222-2222-2222-2222-222222222222"),
      });
      const randomUUIDImpl = jest.fn().mockReturnValue("should-not-be-used");

      const result = getOrCreateSessionId(storage, randomUUIDImpl);

      expect(result).toBe("22222222-2222-2222-2222-222222222222");
      expect(randomUUIDImpl).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("reads back an already-persisted id even when randomUUIDImpl is unavailable this call (code review)", () => {
      const storage = createFakeStorage({
        getItem: jest.fn().mockReturnValue("22222222-2222-2222-2222-222222222222"),
      });

      const result = getOrCreateSessionId(storage, undefined);

      expect(result).toBe("22222222-2222-2222-2222-222222222222");
      expect(storage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("US3 — Fail-Silent degradation", () => {
    it("returns undefined when randomUUIDImpl is unavailable and nothing is stored", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue(null) });

      const result = getOrCreateSessionId(storage, undefined);

      expect(result).toBeUndefined();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("returns undefined when storage is unavailable", () => {
      const randomUUIDImpl = jest.fn().mockReturnValue("11111111-1111-1111-1111-111111111111");

      const result = getOrCreateSessionId(undefined, randomUUIDImpl);

      expect(result).toBeUndefined();
      expect(randomUUIDImpl).not.toHaveBeenCalled();
    });

    it("returns undefined when getItem throws", () => {
      const storage = createFakeStorage({
        getItem: jest.fn(() => {
          throw new Error("SecurityError: storage disabled");
        }),
      });
      const randomUUIDImpl = jest.fn().mockReturnValue("11111111-1111-1111-1111-111111111111");

      const result = getOrCreateSessionId(storage, randomUUIDImpl);

      expect(result).toBeUndefined();
    });

    it("returns undefined when setItem throws, never returning the unpersisted value", () => {
      const storage = createFakeStorage({
        getItem: jest.fn().mockReturnValue(null),
        setItem: jest.fn(() => {
          throw new Error("QuotaExceededError");
        }),
      });
      const randomUUIDImpl = jest.fn().mockReturnValue("11111111-1111-1111-1111-111111111111");

      const result = getOrCreateSessionId(storage, randomUUIDImpl);

      expect(result).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("treats an empty-string stored value as absent, originating a fresh one", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue("") });
      const randomUUIDImpl = jest.fn().mockReturnValue("33333333-3333-3333-3333-333333333333");

      const result = getOrCreateSessionId(storage, randomUUIDImpl);

      expect(result).toBe("33333333-3333-3333-3333-333333333333");
      expect(storage.setItem).toHaveBeenCalledWith(
        "adServeSessionId",
        "33333333-3333-3333-3333-333333333333",
      );
    });
  });
});
