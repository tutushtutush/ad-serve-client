import { createAdRenderer } from "../../../src/renderer/adRenderer";
import { makeAdWithResolvedRender } from "../fixtures/adCreative";
import type { AdCandidate } from "../../../src/types";

function renderAndGetSrcdoc(ad: AdCandidate): string {
  document.body.innerHTML = "";
  const slot = document.createElement("div");
  document.body.append(slot);
  createAdRenderer(document).renderAd(slot, ad);
  return slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
}

describe("createAdRenderer", () => {
  it("appends an iframe with a narrow sandbox and no scripting privileges", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document).renderAd(slot, makeAdWithResolvedRender());

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

    createAdRenderer(document).renderAd(slot, makeAdWithResolvedRender());

    const iframe = slot.querySelector("iframe");
    expect(iframe?.getAttribute("width")).toBe("300");
    expect(iframe?.getAttribute("height")).toBe("250");
  });

  describe("logo (US1)", () => {
    it("renders the logo when hasLogoImage and logoImageDataUrl are set", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ hasLogoImage: true, logoImageDataUrl: "data:image/png;base64,LOGO" }),
      );

      expect(markup).toContain("data:image/png;base64,LOGO");
    });

    it("renders no logo element when hasLogoImage is false", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ hasLogoImage: false, logoImageDataUrl: "data:image/png;base64,LOGO" }),
      );

      expect(markup).not.toContain("LOGO");
    });

    it("gives the logo a background when logoBackgroundEnabled is true", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          hasLogoImage: true,
          logoImageDataUrl: "data:image/png;base64,X",
          logoBackgroundEnabled: true,
          logoBackgroundColor: "#ff00ff",
        }),
      );

      expect(markup).toContain("background-color:#ff00ff");
    });

    it("omits the logo's background when logoBackgroundEnabled is false", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          hasLogoImage: true,
          logoImageDataUrl: "data:image/png;base64,X",
          logoBackgroundEnabled: false,
          logoBackgroundColor: "#ff00ff",
        }),
      );

      expect(markup).not.toContain("#ff00ff");
    });
  });

  describe("resolved colors and fonts (US2)", () => {
    it("applies resolved headline and CTA colors/fonts when set", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          headlineTextColor: "#123456",
          headlineFontFamily: "Georgia, serif",
          ctaTextColor: "#654321",
          ctaFontFamily: "Courier, monospace",
        }),
      );

      expect(markup).toContain("color:#123456");
      expect(markup).toContain("font-family:Georgia, serif");
      expect(markup).toContain("color:#654321");
      expect(markup).toContain("font-family:Courier, monospace");
    });

    it("falls back to defaults when colors/fonts are unset", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          headlineTextColor: undefined,
          headlineFontFamily: undefined,
          ctaTextColor: undefined,
          ctaFontFamily: undefined,
        }),
      );

      expect(markup).toContain("font-family:inherit");
    });
  });

  describe("CTA background (US3)", () => {
    it("always applies a CTA background color, even a default one", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ ctaBackgroundColor: undefined }));

      expect(markup).toMatch(/background-color:#[0-9a-fA-F]{3,6}/);
    });

    it("uses the resolved CTA background color when set", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ ctaBackgroundColor: "#00ff00" }));

      expect(markup).toContain("background-color:#00ff00");
    });
  });

  describe("background image vs. placeholder (US4)", () => {
    it("renders the background image when present, with no placeholder", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          hasBackgroundImage: true,
          backgroundImageDataUrl: "data:image/png;base64,BG",
        }),
      );

      expect(markup).toContain("data:image/png;base64,BG");
      expect(markup).not.toContain("<svg");
    });

    it("renders a placeholder when no background image is present, with no background-image style", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ hasBackgroundImage: false, backgroundImageDataUrl: undefined }),
      );

      expect(markup).toContain("<svg");
      expect(markup).not.toContain("background-image:url");
    });

    it("sizes the placeholder icon from iconSize when valid", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ hasBackgroundImage: false, iconSize: 42 }),
      );

      expect(markup).toContain('width="42"');
      expect(markup).toContain('height="42"');
    });

    it("computes a fallback icon size from the ad's own dimensions when iconSize is invalid", () => {
      const ad = makeAdWithResolvedRender({ hasBackgroundImage: false, iconSize: -1 });
      ad.width = 300;
      ad.height = 150;
      const markup = renderAndGetSrcdoc(ad);

      // min(300, 150) / 3 = 50
      expect(markup).toContain('width="50"');
    });
  });

  describe("clickability (US5, FR-008)", () => {
    it("renders a clickable <a> when isLinked is true and linkUrl is a safe http(s) URL", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
      );

      expect(markup).toContain('<a href="https://example.com/sale"');
    });

    it("renders a non-interactive wrapper when isLinked is false", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: false, linkUrl: "https://example.com/sale" }),
      );

      expect(markup).not.toContain("<a ");
      expect(markup).toContain('role="img"');
    });

    it("does not become clickable when isLinked is true but linkUrl is an unsafe scheme", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: true, linkUrl: "javascript:alert(1)" }),
      );

      expect(markup).not.toContain("<a ");
      expect(markup).not.toContain("javascript:alert");
    });
  });

  describe("escaping (FR-009)", () => {
    it("escapes headline, CTA text, and aria-label", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          headlineText: '<script>alert("x")</script>',
          ctaText: "A & B",
          ariaLabel: '"quoted" label',
        }),
      );

      expect(markup).not.toContain("<script>alert");
      expect(markup).toContain("&lt;script&gt;");
      expect(markup).toContain("A &amp; B");
      expect(markup).toContain("&quot;quoted&quot; label");
    });
  });

  describe("safe degradation (FR-010)", () => {
    it("does not throw and produces safe markup when resolvedRender is missing entirely", () => {
      const ad: AdCandidate = { creative: {}, width: 300, height: 250 };

      expect(() => renderAndGetSrcdoc(ad)).not.toThrow();
      const markup = renderAndGetSrcdoc(ad);
      expect(markup).not.toContain("undefined");
      expect(markup).not.toContain("null");
      expect(markup).not.toContain("<a ");
      expect(markup).toContain("<svg");
    });

    it("does not throw when resolvedRender fields are wrong-typed", () => {
      const ad = {
        creative: {},
        width: 300,
        height: 250,
        resolvedRender: {
          headlineText: 123,
          hasLogoImage: "yes",
          logoImageDataUrl: {},
          isLinked: "true",
          iconSize: "big",
        },
      } as unknown as AdCandidate;

      expect(() => renderAndGetSrcdoc(ad)).not.toThrow();
    });
  });
});
