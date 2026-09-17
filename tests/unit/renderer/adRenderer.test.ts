import { createAdRenderer } from "../../../src/renderer/adRenderer";
import type { AdCandidate } from "../../../src/types";

function makeAd(overrides: Partial<AdCandidate["creative"]> = {}): AdCandidate {
  return {
    creative: {
      backgroundImageDataUrl: null,
      logoImageDataUrl: null,
      logoBackgroundEnabled: false,
      logoBackgroundColor: "",
      headline: "Summer Sale",
      ctaText: "Shop Now",
      linkUrl: "https://example.com/sale",
      altText: "Summer Sale banner",
      headlineTextColor: "",
      headlineFontFamily: "",
      ctaTextColor: "",
      ctaFontFamily: "",
      ctaBackgroundColor: "",
      ...overrides,
    },
    width: 300,
    height: 250,
  };
}

describe("createAdRenderer", () => {
  it("appends an iframe with a narrow sandbox and no scripting privileges", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(slot, makeAd());

    const iframe = slot.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-popups");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("applies the ad's width and height", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(slot, makeAd());

    const iframe = slot.querySelector("iframe");
    expect(iframe?.getAttribute("width")).toBe("300");
    expect(iframe?.getAttribute("height")).toBe("250");
  });

  it("escapes creative text fields in the resulting markup", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(
      slot,
      makeAd({ headline: '<script>alert("x")</script>', ctaText: "A & B" }),
    );

    const markup = slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(markup).not.toContain("<script>alert");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("A &amp; B");
  });

  it("falls back to a safe href when linkUrl isn't http(s)", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(slot, makeAd({ linkUrl: "javascript:alert(1)" }));

    const markup = slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(markup).not.toContain("javascript:alert");
    expect(markup).toContain('href="#"');
  });
});
