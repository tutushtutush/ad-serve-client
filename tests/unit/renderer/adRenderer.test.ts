import { readFileSync } from "fs";
import { join } from "path";
import { createAdRenderer } from "../../../src/renderer/adRenderer";
import { makeAdWithResolvedRender } from "../fixtures/adCreative";
import { CLASSIC_CASES } from "../fixtures/classicCases";
import { layoutGeometry, type AdLayout } from "../../../src/utils/adLayout";
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
  sessionId?: string,
): string {
  document.body.innerHTML = "";
  const slot = document.createElement("div");
  document.body.append(slot);
  createAdRenderer(document, apiBaseUrl).renderAd(slot, ad, placement, sessionId);
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

  describe("background image position (spec 014)", () => {
    const render = (position: unknown, hasImage = true) =>
      renderAndGetSrcdoc(
        makeAdWithResolvedRender({
          hasBackgroundImage: hasImage,
          backgroundImageDataUrl: hasImage ? "data:image/png;base64,BG" : undefined,
          backgroundImagePosition: position as string,
        }),
      );

    // Same table as adconfig spec 074's contracts/resolved-render.md and ad-serve-api's tests.
    it.each([
      ["top-left", "left top"],
      ["top", "center top"],
      ["top-right", "right top"],
      ["left", "left center"],
      ["center", "center center"],
      ["right", "right center"],
      ["bottom-left", "left bottom"],
      ["bottom", "center bottom"],
      ["bottom-right", "right bottom"],
    ])("anchors the image at %s", (name, anchor) => {
      expect(render(name)).toContain(`object-fit:cover;object-position:${anchor};`);
    });

    it.each([undefined, null, "", "LEFT", "left; x", 5, {}, "url(x)", "toString", "__proto__"])(
      "centers the image for %p",
      (value) => {
        const markup = render(value);

        expect(markup).toContain("object-fit:cover;object-position:center center;");
        if (typeof value === "string" && value) expect(markup).not.toContain(value);
      },
    );

    it("ignores the position when there is no background image", () => {
      const markup = render("left", false);

      expect(markup).not.toContain("object-position");
      expect(markup).toContain("<svg");
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

    it("omits the CTA button entirely when ctaText is genuinely empty, rather than an empty colored pill", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ ctaText: "" }));

      expect(markup).not.toContain('role="button"');
    });

    it("still renders the headline as an empty, background-less span when headlineText is empty", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ headlineText: "" }));

      expect(markup).toContain("font-weight:700");
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

  describe("session id attached to click tracking (feature 008, US2)", () => {
    it("includes sessionId as a query parameter when supplied to renderAd", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: "ad-1",
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT, "sess-1");

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const url = new URL(hrefMatch![1].replace(/&amp;/g, "&"));
      expect(url.searchParams.get("sessionId")).toBe("sess-1");
    });

    it("omits sessionId from the click URL when absent, unchanged from before this feature", () => {
      const ad = {
        ...makeAdWithResolvedRender({ isLinked: true, linkUrl: "https://example.com/sale" }),
        adConfigId: "ad-1",
      };

      const markup = renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT);

      const hrefMatch = markup.match(/<a href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const url = new URL(hrefMatch![1].replace(/&amp;/g, "&"));
      expect(url.searchParams.has("sessionId")).toBe(false);
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

// Spec 018: layout presets.
describe("createAdRenderer layouts (spec 018)", () => {
  const BG = "data:image/png;base64,BG";
  const LOGO = "data:image/png;base64,LOGO";
  const full = { hasBackgroundImage: true, backgroundImageDataUrl: BG, hasLogoImage: true, logoImageDataUrl: LOGO };

  function adAt(width: number, height: number, overrides = {}): AdCandidate {
    return { ...makeAdWithResolvedRender(overrides), width, height };
  }

  function drawn(ad: AdCandidate): Document {
    return new DOMParser().parseFromString(renderAndGetSrcdoc(ad), "text/html");
  }

  // The image box is the element holding the background image; the text box is the one holding the headline.
  const imageBox = (doc: Document) => doc.querySelector(`img[src="${BG}"]`)?.parentElement as HTMLElement | null;
  const textBox = (doc: Document) => doc.querySelector("span")?.parentElement as HTMLElement;

  describe("classic markup is unchanged (FR-004)", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "../fixtures/classicMarkup.golden.json"), "utf8"),
    ) as Record<string, string>;
    const render = (ad: AdCandidate) => renderAndGetSrcdoc(ad, API_BASE_URL, PLACEMENT, "sess-1");

    it.each(Object.keys(CLASSIC_CASES))("%s matches the previous release", (name) => {
      expect(render(CLASSIC_CASES[name]())).toBe(golden[name]);
    });

    it.each(Object.keys(CLASSIC_CASES))("%s with layout classic or a bad layout is identical", (name) => {
      for (const layout of ["classic", "", "IMAGE-LEFT", "diagonal", 5, null, {}, []]) {
        const ad = CLASSIC_CASES[name]();
        if (ad.resolvedRender) (ad.resolvedRender as Record<string, unknown>).layout = layout;
        expect(render(ad)).toBe(golden[name]);
      }
    });
  });

  // Spec 020 gives every classic ad of 82px and over a headline line clamp and a one-line button. The golden file
  // changes because of it; this shows it changes by nothing else: take the added styles out of the new markup and
  // what is left is exactly the markup of the release before spec 020.
  describe("classic markup differs from the release before spec 020 only by the added styles", () => {
    const pre110 = JSON.parse(
      readFileSync(join(__dirname, "../fixtures/classicMarkup.pre110.golden.json"), "utf8"),
    ) as Record<string, string>;
    const ADDED_TO_HEADLINE = /display:-webkit-box;-webkit-line-clamp:\d+;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;min-width:0;max-width:100%;/g;
    const ADDED_TO_BUTTON = /max-width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/g;

    it.each(Object.keys(CLASSIC_CASES))("%s", (name) => {
      const markup = renderAndGetSrcdoc(CLASSIC_CASES[name](), API_BASE_URL, PLACEMENT, "sess-1");

      expect(markup.replace(ADDED_TO_HEADLINE, "").replace(ADDED_TO_BUTTON, "")).toBe(pre110[name]);
    });
  });

  describe("classic headline limit on ads of 82px and over (spec 020)", () => {
    const LONG = "word ".repeat(80);
    const long = { ...full, headlineText: LONG, ctaText: "Buy Now", layout: "classic" };

    it.each([
      [300, 250, 11],
      [970, 250, 11],
      [300, 600, 31],
      [728, 90, 1],
      [320, 100, 2],
    ])("clamps a long headline at %ix%i to %i lines", (width, height, lines) => {
      const markup = renderAndGetSrcdoc(adAt(width, height, long));

      expect(markup).toContain(`-webkit-line-clamp:${lines};`);
      expect(markup).toContain("overflow-wrap:anywhere");
    });

    it("gives the room of a missing logo or button to the headline", () => {
      expect(renderAndGetSrcdoc(adAt(300, 250, { ...long, hasLogoImage: false }))).toContain("-webkit-line-clamp:12;");
      expect(renderAndGetSrcdoc(adAt(300, 250, { ...long, ctaText: "" }))).toContain("-webkit-line-clamp:12;");
      expect(renderAndGetSrcdoc(adAt(320, 100, { ...long, hasLogoImage: false, ctaText: "" }))).toContain("-webkit-line-clamp:4;");
    });

    it("does not give the headline a line height of its own", () => {
      const doc = drawn(adAt(300, 250, long));

      expect((doc.querySelector("span:not([role=button])") as HTMLElement).style.lineHeight).toBe("");
    });

    it.each([[0], [-5], [NaN]])("draws an ad of height %s as before, with no clamp", (height) => {
      const markup = renderAndGetSrcdoc(adAt(300, height, long));

      expect(markup).not.toContain("-webkit-line-clamp");
    });

    it("leaves a short ad to the rule of spec 019 and the other layouts alone", () => {
      expect(renderAndGetSrcdoc(adAt(468, 60, long))).toContain("-webkit-line-clamp:1;");
      expect(renderAndGetSrcdoc(adAt(300, 250, { ...long, layout: "overlay" }))).not.toContain("-webkit-line-clamp:11;");
    });
  });

  describe("hostile values (FR-005, FR-011)", () => {
    const hostile: unknown[] = [
      '"><script>alert(1)</script>',
      "' onload='alert(1)",
      "image-left; background:url(x)",
      "image-left\" style=\"x",
      "</iframe>",
      "x".repeat(10_000),
      "__proto__",
      "constructor",
      { toString: () => "image-left" },
      ["image-left"],
      42,
      true,
    ];

    it.each(hostile.map((value, index) => [index, value]))("case %i draws classic and does not echo the value", (_index, value) => {
      const ad = makeAdWithResolvedRender();
      (ad.resolvedRender as Record<string, unknown>).layout = value;

      let markup = "";
      expect(() => {
        markup = renderAndGetSrcdoc(ad);
      }).not.toThrow();

      expect(markup).toBe(renderAndGetSrcdoc(makeAdWithResolvedRender()));
      if (typeof value === "string" && value.length < 100) expect(markup).not.toContain(value);
    });
  });

  it("image-left puts the image on the left half and the text on the right half", () => {
    const doc = drawn(adAt(300, 250, { ...full, layout: "image-left" }));

    expect(imageBox(doc)?.getAttribute("style")).toContain("left:0%;top:0%;width:50%;height:100%;");
    expect(textBox(doc).getAttribute("style")).toContain("left:50%;top:0%;width:50%;height:100%;");
    expect(textBox(doc).textContent).toContain("Shop Now");
    expect(textBox(doc).querySelector(`img[src="${LOGO}"]`)).not.toBeNull();
  });

  it("image-left on a tall ad is arranged like image-top", () => {
    const doc = drawn(adAt(300, 600, { ...full, layout: "image-left" }));

    expect(imageBox(doc)?.getAttribute("style")).toContain("width:100%;height:60%;");
    expect(textBox(doc).getAttribute("style")).toContain("left:0%;top:60%;width:100%;height:40%;");
  });

  it("image-top puts the image on top for 60% and the text below", () => {
    const doc = drawn(adAt(300, 250, { ...full, layout: "image-top" }));

    expect(imageBox(doc)?.getAttribute("style")).toContain("left:0%;top:0%;width:100%;height:60%;");
    expect(textBox(doc).getAttribute("style")).toContain("left:0%;top:60%;width:100%;height:40%;");
  });

  it("overlay centers the text on a dark layer over a full-size image", () => {
    const doc = drawn(adAt(300, 250, { ...full, layout: "overlay" }));

    expect(imageBox(doc)?.getAttribute("style")).toContain("width:100%;height:100%;");
    expect(textBox(doc).getAttribute("style")).toContain("text-align:center;");
    expect(textBox(doc).getAttribute("style")).toContain("background-color:rgba(0,0,0,0.45);");
  });

  it("text-only draws no image even when the response has one, and keeps the text", () => {
    const doc = drawn(adAt(300, 250, { ...full, layout: "text-only" }));

    expect(doc.querySelector(`img[src="${BG}"]`)).toBeNull();
    expect(textBox(doc).textContent).toContain("Summer Sale");
    expect(textBox(doc).textContent).toContain("Shop Now");
    expect(textBox(doc).getAttribute("style")).toContain("text-align:center;");
  });

  it.each(["image-left", "image-top", "overlay"])("%s keeps the background position inside the image box", (layout) => {
    const doc = drawn(adAt(300, 250, { ...full, layout, backgroundImagePosition: "bottom-right" }));

    expect(doc.querySelector(`img[src="${BG}"]`)?.getAttribute("style")).toContain("object-position:right bottom;");
  });

  it("keeps the link wrapper and aria label", () => {
    const doc = drawn(adAt(300, 250, { layout: "image-left" }));

    expect(doc.querySelector("a")?.getAttribute("href")).toBe("https://example.com/sale");
    expect(doc.querySelector("a")?.getAttribute("aria-label")).toBe("Summer Sale banner");
  });

  describe("sizes and missing parts (US3)", () => {
    const longHeadline = `${"Supercalifragilisticexpialidocious".repeat(6)} sale`;
    const layouts = ["image-left", "image-top", "overlay", "text-only"];
    const sizes: [number, number][] = [
      [970, 250],
      [300, 600],
      [300, 250],
    ];

    it.each(layouts.flatMap((layout) => sizes.map((size) => [layout, size] as const)))(
      "%s at %j clamps a long headline to the lines its box has room for and breaks a long word",
      (layout, [width, height]) => {
        const doc = drawn(adAt(width, height, { ...full, layout, headlineText: longHeadline }));

        const style = doc.querySelector("span")?.getAttribute("style") ?? "";
        expect(style).toContain(`-webkit-line-clamp:${layoutGeometry(layout as AdLayout, width, height)?.headlineLines};`);
        expect(textBox(doc).getAttribute("style")).toContain("overflow:hidden;");
        expect(style).toContain("overflow:hidden;");
        expect(style).toContain("overflow-wrap:anywhere;");
      },
    );

    it("keeps the button to one line and the headline to 18px lines, so the fit estimate holds", () => {
      const doc = drawn(adAt(300, 250, { ...full, layout: "image-left", ctaText: "Download our free app today" }));

      const button = doc.querySelector("[role=button]")?.getAttribute("style") ?? "";
      expect(button).toContain("white-space:nowrap;");
      expect(button).toContain("text-overflow:ellipsis;");
      expect(button).toContain("line-height:16px;");
      expect(doc.querySelector("span")?.getAttribute("style")).toContain("line-height:18px;");
    });

    it("gives the classic button the one-line limit but no fixed line height (spec 020)", () => {
      const markup = renderAndGetSrcdoc(makeAdWithResolvedRender({ ctaText: "Download our free app today" }));

      expect(markup).toContain("white-space:nowrap");
      expect(markup).not.toContain("line-height:16px");
    });

    it("draws image-top side by side on a short ad", () => {
      const doc = drawn(adAt(468, 60, { ...full, layout: "image-top" }));

      expect(imageBox(doc)?.getAttribute("style")).toContain("width:50%;height:100%;");
      expect(doc.querySelector(`img[src="${LOGO}"]`)).toBeNull();
      expect(doc.body.textContent).toContain("Shop Now");
    });

    it("leaves out the logo before the button when the text box is short", () => {
      const doc = drawn(adAt(300, 150, { ...full, layout: "image-top" }));

      expect(doc.querySelector(`img[src="${LOGO}"]`)).toBeNull();
      expect(doc.body.textContent).toContain("Shop Now");
    });

    it("leaves out the button too when the text box is shorter than the button", () => {
      const doc = drawn(adAt(300, 50, { ...full, layout: "image-top" }));

      expect(doc.body.textContent).not.toContain("Shop Now");
      expect(doc.body.textContent).toContain("Summer Sale");
    });

    it.each(layouts)("%s draws nothing for a missing logo, headline or button, and no stray image", (layout) => {
      const doc = drawn(adAt(300, 250, { layout, headlineText: "", ctaText: "" }));

      expect(doc.querySelectorAll("img")).toHaveLength(0);
      expect(doc.body.textContent?.trim()).toBe("");
      expect(doc.querySelector("[role=button]")).toBeNull();
    });

    it.each([
      ["image-left", 1],
      ["image-top", 1],
      ["overlay", 0],
      ["text-only", 0],
    ])("%s with no image draws %i placeholder icon(s)", (layout, count) => {
      const doc = drawn(adAt(300, 250, { layout }));

      expect(doc.querySelectorAll("svg")).toHaveLength(count);
    });

    it("draws an ad with a zero size as classic", () => {
      const ad = adAt(0, 0, { ...full, layout: "image-left" });

      expect(renderAndGetSrcdoc(ad)).toBe(renderAndGetSrcdoc(adAt(0, 0, full)));
    });
  });
  describe("classic on a short ad (spec 019)", () => {
    const classic = { ...full, layout: "classic" };

    it("drops the logo and keeps the button and one line of headline at 468x60", () => {
      const doc = drawn(adAt(468, 60, classic));
      const headline = doc.querySelector("span:not([role=button])") as HTMLElement;
      const button = doc.querySelector("[role=button]") as HTMLElement;

      expect(doc.querySelector(`img[src="${LOGO}"]`)).toBeNull();
      expect(headline.style.lineHeight).toBe("18px");
      expect(headline.style.webkitLineClamp).toBe("1");
      expect(button.style.whiteSpace).toBe("nowrap");
      expect(button.style.textOverflow).toBe("ellipsis");
      expect(button.style.lineHeight).toBe("16px");
    });

    it("drops the logo and the button at 320x50 and keeps one line of headline", () => {
      const doc = drawn(adAt(320, 50, classic));

      expect(doc.querySelector(`img[src="${LOGO}"]`)).toBeNull();
      expect(doc.querySelector("[role=button]")).toBeNull();
      expect(doc.body.textContent).toContain("Summer Sale");
    });

    it("keeps the classic wrapper, with the text at the bottom", () => {
      const markup = renderAndGetSrcdoc(adAt(320, 50, classic));

      expect(markup).toContain("flex-direction:column;justify-content:flex-end;box-sizing:border-box;padding:8px;overflow:hidden");
      expect(markup).toContain(`<img src="${BG}"`);
    });

    it("draws an ad with no logo, headline or button without errors", () => {
      for (const height of [60, 50]) {
        expect(() => renderAndGetSrcdoc(adAt(468, height, { headlineText: "", ctaText: "", layout: "classic" }))).not.toThrow();
      }
    });

    it.each(["", "IMAGE-LEFT", "diagonal", 5, null])("an unknown layout %j on a short ad is drawn as classic", (layout) => {
      expect(renderAndGetSrcdoc(adAt(320, 50, { ...full, layout }))).toBe(renderAndGetSrcdoc(adAt(320, 50, classic)));
    });

    it("leaves the other layouts alone: image-left at 320x50 is not the short classic", () => {
      expect(renderAndGetSrcdoc(adAt(320, 50, { ...full, layout: "image-left" }))).not.toContain("justify-content:flex-end");
    });

    it.each([[300, 250], [970, 250], [300, 600], [728, 90], [320, 100]])("classic at %ix%i keeps the unchanged markup", (width, height) => {
      expect(renderAndGetSrcdoc(adAt(width, height, classic))).toContain("justify-content:space-between");
    });
  });
});
