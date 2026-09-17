import { createAdRenderer } from "../../../src/renderer/adRenderer";
import { makeAd } from "../fixtures/adCreative";

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

  it("never nests a <button> inside the <a> (invalid HTML5)", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(slot, makeAd());

    const markup = slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(markup).not.toContain("<button");
    expect(markup).toContain('role="button"');
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

  it("does not throw and degrades to blank/safe values when creative fields are missing entirely", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    // ad-serve-api only includes fields a campaign actually set (types.ts) —
    // a sparse creative like this is a normal, expected response shape.
    const sparseAd = { creative: {}, width: 300, height: 250 };

    expect(() => createAdRenderer(document).renderAd(slot, sparseAd)).not.toThrow();
    const markup = slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(markup).toContain('href="#"');
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("null");
  });

  it("does not throw when a creative field is an unexpected type (e.g. null)", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    const malformedAd = makeAd({ headline: null as unknown as string, ctaText: 42 as unknown as string });

    expect(() => createAdRenderer(document).renderAd(slot, malformedAd)).not.toThrow();
  });

  it("omits the image entirely when backgroundImageDataUrl is a truthy non-string, instead of rendering a broken empty src", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    // A truthy but non-string value (e.g. a malformed upstream response) —
    // must not produce <img src="">, which the browser treats as a broken
    // image / unexpected request.
    const malformedAd = makeAd({ backgroundImageDataUrl: 42 as unknown as string });

    createAdRenderer(document).renderAd(slot, malformedAd);

    const markup = slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(markup).not.toContain("<img");
  });
});
