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

    expect(readLoaderTagConfig(el)).toEqual({ apiBaseUrl: "https://ads.example.com", platformId: "plat-1" });
  });

  it.each([["absent", {}], ["empty", { "data-platform-id": "" }]])(
    "gives an empty platform id when it is %s",
    (_label, attrs) => {
      expect(readLoaderTagConfig(scriptWith(attrs)).platformId).toBe("");
    },
  );

  it("gives empty values when the script tag cannot be found", () => {
    expect(readLoaderTagConfig(null)).toEqual({ apiBaseUrl: "", platformId: "" });
  });
});
