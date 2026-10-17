import { readLoaderTagConfig } from "../../../src/utils/readLoaderTagConfig";

function scriptWith(attrs: Record<string, string>): HTMLScriptElement {
  const el = document.createElement("script");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

describe("readLoaderTagConfig", () => {
  it("reads the api base url and platform id", () => {
    const el = scriptWith({ "data-api-base-url": "https://ads.example.com", "data-platform-id": "plat-1" });

    expect(readLoaderTagConfig(el)).toEqual({ apiBaseUrl: "https://ads.example.com", platformId: "plat-1", viewerIdStorage: false, viewerIdStorageUnrecognized: false });
  });

  it.each([["absent", {}], ["empty", { "data-platform-id": "" }]])(
    "gives an empty platform id when it is %s",
    (_label, attrs) => {
      expect(readLoaderTagConfig(scriptWith(attrs)).platformId).toBe("");
    },
  );

  it("gives empty values when the script tag cannot be found", () => {
    expect(readLoaderTagConfig(null)).toEqual({ apiBaseUrl: "", platformId: "", viewerIdStorage: false, viewerIdStorageUnrecognized: false });
  });

  describe("viewer identifier storage opt-in (feature 017)", () => {
    it.each(["local", " local ", "\nlocal"])("is on for %j", (value) => {
      expect(readLoaderTagConfig(scriptWith({ "data-viewer-id-storage": value })).viewerIdStorage).toBe(true);
    });

    it.each(["", "LOCAL", "session", "true", "1", "local-storage", "false"])("is off for %j", (value) => {
      expect(readLoaderTagConfig(scriptWith({ "data-viewer-id-storage": value })).viewerIdStorage).toBe(false);
    });

    it("is off when absent or when the script tag cannot be found, and leaves the other fields alone", () => {
      expect(readLoaderTagConfig(scriptWith({})).viewerIdStorage).toBe(false);
      expect(readLoaderTagConfig(null).viewerIdStorage).toBe(false);
      const config = readLoaderTagConfig(
        scriptWith({ "data-api-base-url": "https://ads.example.com", "data-platform-id": "p1", "data-viewer-id-storage": "local" }),
      );
      expect(config).toEqual({ apiBaseUrl: "https://ads.example.com", platformId: "p1", viewerIdStorage: true, viewerIdStorageUnrecognized: false });
    });
  });

  describe("an unrecognised viewer identifier storage value (feature 017 review)", () => {
    it.each(["Local", "true", "session", "", "local-storage", "false"])("flags %j, and leaves the opt-in off", (value) => {
      const config = readLoaderTagConfig(scriptWith({ "data-viewer-id-storage": value }));

      expect(config.viewerIdStorageUnrecognized).toBe(true);
      expect(config.viewerIdStorage).toBe(false);
    });

    it.each(["local", " local "])("does not flag the recognised value %j", (value) => {
      expect(readLoaderTagConfig(scriptWith({ "data-viewer-id-storage": value })).viewerIdStorageUnrecognized).toBe(false);
    });

    it("does not flag an absent attribute or a missing script tag", () => {
      expect(readLoaderTagConfig(scriptWith({})).viewerIdStorageUnrecognized).toBe(false);
      expect(readLoaderTagConfig(null).viewerIdStorageUnrecognized).toBe(false);
    });
  });
});
