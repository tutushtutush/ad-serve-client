import { createAdRenderer } from "../../../src/renderer/adRenderer";
import { makeAdWithResolvedRender } from "../fixtures/adCreative";
import type { AdCandidate, PlacementIdentity } from "../../../src/types";

const API_BASE_URL = "https://ads.example.com";
const PLACEMENT: PlacementIdentity = { platformId: "plat-1", adTypeId: "banner" };

// adConfigId is absent from makeAdWithResolvedRender()'s fixture by design (feature 004) — every
// existing test below exercises the direct-link fallback (research.md) even with a real
// apiBaseUrl/placement supplied, since resolveClickHref requires all three. Dedicated
// click-tracking tests further down set ad.adConfigId explicitly.
function renderAndGetSrcdoc(
  ad: AdCandidate,
  apiBaseUrl: string = API_BASE_URL,
  placement: PlacementIdentity = PLACEMENT,
): string {
  document.body.innerHTML = "";
  const slot = document.createElement("div");
  document.body.append(slot);
  createAdRenderer(document, apiBaseUrl).renderAd(slot, ad, placement);
  return slot.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
}

describe("createAdRenderer", () => {
  it("appends an iframe with a narrow sandbox and no scripting privileges", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document, API_BASE_URL).renderAd(slot, makeAdWithResolvedRender(), PLACEMENT);

    const iframe = slot.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("applies the ad's width and height", () => {
    document.body.innerHTML = "";
    const slot = document.createElement("div");
    document.body.append(slot);

    createAdRenderer(document, API_BASE_URL).renderAd(slot, makeAdWithResolvedRender(), PLACEMENT);

    const iframe = slot.querySelector("iframe");
    expect(iframe?.getAttribute("width")).toBe("300");
    expect(iframe?.getAttribute("height")).toBe("250");
  });

  it("sizes the wrapper via position:absolute;inset:0 so it fills the iframe regardless of html/body height (bug fix)", () => {
    // Sizing the wrapper with width/height:100% would require every
    // ancestor (html, body) to also have a non-auto height for the
    // percentage to resolve — miss one and the ad silently collapses to
    // its content's height instead of filling the iframe. inset:0 on an
    // absolutely positioned element sizes it against the initial
    // containing block (the iframe's own viewport) directly, with no
    // ancestor chain to keep in sync.
    const markup = renderAndGetSrcdoc(makeAdWithResolvedRender());

    // Anchored to the element immediately inside <body> (the wrapper) —
    // the background-image/placeholder layer nested inside it also uses
    // position:absolute;inset:0 (unrelated, pre-existing), so an
    // unanchored match against the whole markup would pass even without
    // this fix.
    expect(markup).toMatch(/<body[^>]*>\s*<(?:a|div)[^>]*style="[^"]*position:absolute;inset:0/);
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

    it("falls back to the placeholder when hasBackgroundImage/backgroundImageDataUrl are wrong-typed (FR-010)", () => {
      const ad = {
        creative: {},
        width: 300,
        height: 250,
        resolvedRender: { hasBackgroundImage: "yes", backgroundImageDataUrl: {} },
      } as unknown as AdCandidate;

      const markup = renderAndGetSrcdoc(ad);

      expect(markup).toContain("<svg");
      expect(markup).not.toContain("<img");
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
      expect(markup).toContain('role="group"');
    });

    it("does not become clickable when isLinked is true but linkUrl is an unsafe scheme", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: true, linkUrl: "javascript:alert(1)" }),
      );

      expect(markup).not.toContain("<a ");
      expect(markup).not.toContain("javascript:alert");
    });

    it("does not hide the headline/CTA text from the accessibility tree on a non-interactive wrapper (code review fix)", () => {
      // role="img" on a wrapper that still contains real text descendants
      // flattens them out of the accessibility tree, as if the whole thing
      // were one opaque image — role="group" keeps the headline/CTA spans'
      // own text exposed to assistive tech.
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: false, headlineText: "Summer Sale", ctaText: "Shop Now" }),
      );

      expect(markup).not.toContain('role="img"');
      expect(markup).toContain('role="group"');
      expect(markup).toContain(">Summer Sale<");
      expect(markup).toContain(">Shop Now<");
    });
  });

  describe("click tracking (feature 004, US1)", () => {
    it("routes the href through ad-serve-api's /click endpoint when adConfigId and apiBaseUrl are both available", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).toContain(`<a href="${API_BASE_URL}/click?`);
      expect(markup).not.toContain('<a href="https://example.com/sale"');
    });

    it("includes the correct platformId, adTypeId, and adConfigId as query parameters", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, { platformId: "plat-9", adTypeId: "leaderboard" });

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const href = hrefMatch![1].replace(/&amp;/g, "&");
      const url = new URL(href);
      expect(url.origin + url.pathname).toBe(`${API_BASE_URL}/click`);
      expect(url.searchParams.get("platformId")).toBe("plat-9");
      expect(url.searchParams.get("adTypeId")).toBe("leaderboard");
      expect(url.searchParams.get("adConfigId")).toBe("ad-1");
    });

    it("still opens in a new tab with the same rel attributes as a direct link", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
    });
  });

  describe("click tracking fallback (feature 004, US2, FR-003)", () => {
    it("falls back to the direct advertiser link when adConfigId is absent", () => {
      // makeAdWithResolvedRender() never sets adConfigId (research.md) — this is the same
      // fixture every pre-004 test above already uses, asserted explicitly here.
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        API_BASE_URL,
        PLACEMENT,
      );

      expect(markup).toContain('<a href="https://example.com/sale"');
      expect(markup).not.toContain("/click?");
    });

    it("falls back to the direct advertiser link when apiBaseUrl is blank", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, "", PLACEMENT);

      expect(markup).toContain('<a href="https://example.com/sale"');
      expect(markup).not.toContain("/click?");
    });

    it("falls back to the direct advertiser link when both adConfigId and apiBaseUrl are unavailable", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        "",
        PLACEMENT,
      );

      expect(markup).toContain('<a href="https://example.com/sale"');
    });

    it("does not throw when apiBaseUrl is an unexpected type (safe degradation, matches FR-010's existing pattern)", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      expect(() => renderAndGetSrcdoc(ad, undefined as unknown as string, PLACEMENT)).not.toThrow();
    });

    it("falls back to the direct advertiser link when adConfigId is wrong-typed (e.g. a number, from a malformed ad-serve-api response — code review fix)", () => {
      // isAdCandidate() in adDecisionClient.ts never validates adConfigId's type, only that
      // creative/width/height are present — a schema-drifted response could hand this a number
      // or object. Un-coerced, that would previously stringify into a broken /click URL (e.g.
      // "adConfigId=%5Bobject+Object%5D") that ad-serve-api's own contract would 400 on, turning
      // a working link into a broken one for the viewer — exactly what FR-003/FR-010 forbid.
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: 12345 as unknown as string,
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).toContain('<a href="https://example.com/sale"');
      expect(markup).not.toContain("/click?");
    });

    it("falls back to the direct advertiser link when adConfigId is an object (code review fix)", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: {} as unknown as string,
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).toContain('<a href="https://example.com/sale"');
      expect(markup).not.toContain("/click?");
      expect(markup).not.toContain("object+Object");
    });
  });

  describe("impression id echoed on click tracking (feature 007, US1)", () => {
    it("includes impressionId as a query parameter when present on the ad", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: "ad-1",
        impressionId: "imp-1",
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const url = new URL(hrefMatch![1].replace(/&amp;/g, "&"));
      expect(url.searchParams.get("impressionId")).toBe("imp-1");
    });

    it("omits impressionId from the click URL when absent, unchanged from before this feature", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: "ad-1",
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const url = new URL(hrefMatch![1].replace(/&amp;/g, "&"));
      expect(url.searchParams.has("impressionId")).toBe(false);
    });

    it("omits impressionId when wrong-typed (e.g. a number, from a malformed ad-serve-api response), never stringifying it into the URL", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: "ad-1",
        impressionId: 12345 as unknown as string,
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const url = new URL(hrefMatch![1].replace(/&amp;/g, "&"));
      expect(url.searchParams.has("impressionId")).toBe(false);
      expect(markup).not.toContain("object+Object");
    });
  });

  describe("impression id never gates click tracking itself (feature 007, US3)", () => {
    it("still falls back to the direct advertiser link when adConfigId is absent, even with impressionId present", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        impressionId: "imp-1",
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).toContain('<a href="https://example.com/sale"');
      expect(markup).not.toContain("/click?");
    });
  });

  describe("click tracking never affects clickability itself (feature 004, FR-004)", () => {
    it("stays non-interactive when isLinked is false, even with adConfigId and apiBaseUrl available", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: false, linkUrl: "https://example.com/sale" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).not.toContain("<a ");
      expect(markup).toContain('role="group"');
    });

    it("stays non-interactive when linkUrl is an unsafe scheme, even with adConfigId and apiBaseUrl available", () => {
      const ad = { ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "javascript:alert(1)" }), adConfigId: "ad-1" };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      expect(markup).not.toContain("<a ");
      expect(markup).not.toContain("javascript:alert");
      expect(markup).not.toContain("/click?");
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

  describe("CSS/URL injection safety (code review fix)", () => {
    it("does not let a quote in backgroundImageDataUrl break out of its CSS context", () => {
      // The background image is rendered as an <img src>, not a CSS
      // url(...) — so there is no CSS string for a quote to break out of at
      // all. Assert the injected payload never appears as applied CSS.
      const payload = "https://x/y' );position:fixed;top:0;left:0;background:#000;--z='";
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ hasBackgroundImage: true, backgroundImageDataUrl: payload }),
      );

      expect(markup).not.toContain("background-image:url");
      expect(markup).toContain("<img");
      // The payload is safely confined to the <img>'s own src attribute
      // (HTML-escaped, inert as CSS) — it must never appear as part of any
      // style="..." attribute's actual applied CSS.
      const styleAttrs = markup.match(/style="[^"]*"/g) ?? [];
      for (const style of styleAttrs) {
        expect(style).not.toContain("position:fixed");
      }
    });

    it("does not let a semicolon in a resolved color/font value inject new CSS declarations", () => {
      const payload = "white;position:absolute;inset:0;background:#000;z-index:99";
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ headlineTextColor: payload }));

      expect(markup).not.toContain(payload);
      expect(markup).not.toContain("position:absolute;inset:0;background:#000");
      // Falls back to the safe default instead of the unsafe value.
      expect(markup).toContain("color:#ffffff");
    });

    it("does not let a CSS comment in a resolved value hide/reveal adjacent declarations", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ ctaTextColor: "red/*" }));

      expect(markup).not.toContain("/*");
      expect(markup).toContain("color:#0369a1"); // falls back to default
    });

    it("still accepts legitimate font-family values containing commas and quotes", () => {
      const markup = renderAndGetSrcdoc(
        makeAdWithResolvedRender({ headlineFontFamily: "Georgia, 'Times New Roman', serif" }),
      );

      // Single quotes are HTML-entity-escaped (escapeForMarkup applies
      // uniformly, even though they're harmless inside a double-quoted
      // attribute) — the browser decodes them back to literal quotes before
      // the CSS engine sees the value, so this remains valid, correct CSS.
      expect(markup).toContain("font-family:Georgia, &#39;Times New Roman&#39;, serif");
    });

    it("opens the advertiser's landing page without inheriting the ad's own sandbox restrictions", () => {
      document.body.innerHTML = "";
      const slot = document.createElement("div");
      document.body.append(slot);
      createAdRenderer(document, API_BASE_URL).renderAd(slot, makeAdWithResolvedRender(), PLACEMENT);

      const sandbox = slot.querySelector("iframe")?.getAttribute("sandbox") ?? "";
      expect(sandbox).toContain("allow-popups-to-escape-sandbox");
    });
  });

  describe("safe degradation (FR-010)", () => {
    it("does not throw and produces safe markup when resolvedRender is missing entirely", () => {
      const ad: AdCandidate = { creative: {}, width: 300, height: 250 };
      let markup = "";

      expect(() => {
        markup = renderAndGetSrcdoc(ad);
      }).not.toThrow();
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
