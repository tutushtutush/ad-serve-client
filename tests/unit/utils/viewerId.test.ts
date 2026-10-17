import {
  VIEWER_ID_STORAGE_KEY,
  createViewerIdStore,
  isViewerId,
  type ViewerIdStorageLike,
} from "../../../src/utils/viewerId";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER = "11111111-1111-1111-1111-111111111111";

function createFakeStorage(overrides: Partial<ViewerIdStorageLike> = {}): ViewerIdStorageLike {
  return {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    ...overrides,
  };
}

describe("isViewerId", () => {
  it("accepts a UUID in either case", () => {
    expect(isViewerId(UUID)).toBe(true);
    expect(isViewerId(UUID.toUpperCase())).toBe(true);
  });

  it.each(["", " ", "abc", `${UUID} `, ` ${UUID}`, UUID.slice(1), `${UUID}0`, "3fa85f64-5717-4562-b3fc-2c963f66afag", 5, null, undefined, {}, [UUID], true])(
    "refuses %p",
    (value) => {
      expect(isViewerId(value)).toBe(false);
    },
  );
});

describe("createViewerIdStore", () => {
  describe("getOrCreate", () => {
    it("creates and keeps a fresh identifier when nothing is stored", () => {
      const storage = createFakeStorage();
      const randomUUIDImpl = jest.fn().mockReturnValue(UUID);

      const result = createViewerIdStore(storage, randomUUIDImpl).getOrCreate();

      expect(result).toBe(UUID);
      expect(storage.setItem).toHaveBeenCalledWith(VIEWER_ID_STORAGE_KEY, UUID);
    });

    it("keeps the identifier the storage ends up holding when another tab wrote one in between", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValueOnce(null).mockReturnValue(OTHER) });

      const result = createViewerIdStore(storage, () => UUID).getOrCreate();

      expect(storage.setItem).toHaveBeenCalledWith(VIEWER_ID_STORAGE_KEY, UUID);
      expect(result).toBe(OTHER);
    });

    it("keeps its own identifier when the read-back is not a usable UUID", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue(null) });

      expect(createViewerIdStore(storage, () => UUID).getOrCreate()).toBe(UUID);
    });

    it("reads back a stored identifier without regenerating or writing", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue(OTHER) });
      const randomUUIDImpl = jest.fn();

      expect(createViewerIdStore(storage, randomUUIDImpl).getOrCreate()).toBe(OTHER);
      expect(randomUUIDImpl).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("replaces a stored value that is not a UUID", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue("hand-edited") });

      const result = createViewerIdStore(storage, () => UUID).getOrCreate();

      expect(result).toBe(UUID);
      expect(storage.setItem).toHaveBeenCalledWith(VIEWER_ID_STORAGE_KEY, UUID);
    });

    it("keeps the identifier under the one documented key", () => {
      expect(VIEWER_ID_STORAGE_KEY).toBe("adServeViewerId");
    });

    it("gives nothing without storage", () => {
      expect(createViewerIdStore(undefined, () => UUID).getOrCreate()).toBeUndefined();
    });

    it("gives nothing, and writes nothing, without an id generator", () => {
      const storage = createFakeStorage();

      expect(createViewerIdStore(storage, undefined).getOrCreate()).toBeUndefined();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("still returns an existing identifier when no generator is available", () => {
      const storage = createFakeStorage({ getItem: jest.fn().mockReturnValue(OTHER) });

      expect(createViewerIdStore(storage, undefined).getOrCreate()).toBe(OTHER);
    });

    it("gives nothing when reading throws", () => {
      const storage = createFakeStorage({
        getItem: jest.fn(() => {
          throw new Error("blocked");
        }),
      });

      expect(createViewerIdStore(storage, () => UUID).getOrCreate()).toBeUndefined();
    });

    it("never returns an identifier it could not keep", () => {
      const storage = createFakeStorage({
        setItem: jest.fn(() => {
          throw new Error("quota");
        }),
      });

      expect(createViewerIdStore(storage, () => UUID).getOrCreate()).toBeUndefined();
    });

    it("gives nothing when the generator throws", () => {
      const storage = createFakeStorage();

      expect(
        createViewerIdStore(storage, () => {
          throw new Error("no crypto");
        }).getOrCreate(),
      ).toBeUndefined();
      expect(storage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes the kept identifier", () => {
      const storage = createFakeStorage();

      createViewerIdStore(storage, () => UUID).remove();

      expect(storage.removeItem).toHaveBeenCalledWith(VIEWER_ID_STORAGE_KEY);
    });

    it("does nothing without storage, and swallows a throwing removal", () => {
      expect(() => createViewerIdStore(undefined, undefined).remove()).not.toThrow();
      const storage = createFakeStorage({
        removeItem: jest.fn(() => {
          throw new Error("blocked");
        }),
      });
      expect(() => createViewerIdStore(storage, undefined).remove()).not.toThrow();
    });
  });
});
