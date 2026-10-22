import { escapeForMarkup } from "../utils/escapeForMarkup";
import { asSafeString } from "../utils/asSafeString";
import { buildTrackingUrl } from "../utils/buildTrackingUrl";
import { classicFit, classicHeadlineLines, layoutGeometry, normalizeLayout, type LayoutBox, type LayoutGeometry } from "../utils/adLayout";
import type { AdCandidate, PlacementIdentity, ResolvedAdCreativeRender } from "../types";

function asSafeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asSafePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

// A resolved color/font value is placed directly into a CSS property value
// with no surrounding quotes — HTML-escaping only guards the HTML
// attribute-value context, it does nothing to stop the *decoded* value from
// injecting new CSS once the browser's HTML parser hands the style
// attribute's content to the CSS engine. Reject anything that could break
// out of a single CSS value: a semicolon starts a new declaration, braces
// could break out of the rule entirely, and a CSS comment could hide/reveal
// characters unpredictably. Falls back to the given safe default otherwise.
function asSafeCssValue(value: unknown, fallback: string): string {
  const str = asSafeString(value);
  const isSafe = str.length > 0 && !/[;{}]/.test(str) && !str.includes("/*");
  return escapeForMarkup(isSafe ? str : fallback);
}

// Colors have a closed, well-known grammar, so unlike font-family (arbitrary
// names, hard to allowlist without rejecting legitimate values) they can be
// validated by allowlist rather than blocklist — closing off the whole class
// of "unknown future bypass character" risk, not just the characters known
// today (code review round 2).
const SAFE_CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.%,\s]+\)|hsla?\([\d.%,\s]+\)|[a-zA-Z]+)$/;

function asSafeCssColor(value: unknown, fallback: string): string {
  const str = asSafeString(value);
  const isSafe = SAFE_CSS_COLOR.test(str);
  return escapeForMarkup(isSafe ? str : fallback);
}

// Both the logo and background image share the same "is this actually
// usable" rule: the enable flag is on, and the data URL is a non-empty
// string (code review round 2 — was duplicated verbatim at each call site).
function hasResolvedImage(flag: unknown, dataUrl: unknown): boolean {
  return asSafeBoolean(flag, false) && typeof dataUrl === "string" && dataUrl.length > 0;
}

// Only allow http(s) links — linkUrl is external, untrusted data, and
// rendering it as an href must never permit a javascript: (or other) scheme
// escape, regardless of what isLinked says (FR-008). Returns null (not a
// "#" fallback) so the caller can tell "unsafe/absent" apart from "safe" and
// fall back to a non-interactive wrapper instead of a dead link.
function toSafeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

// Routes an already-safe click target through ad-serve-api's click-tracking endpoint (feature
// 004) instead of linking straight to the advertiser — but only when there's enough information
// to build that URL. Any one of adConfigId/apiBaseUrl missing falls back to safeHref directly
// (FR-003, research.md): a tracking limitation must never turn a working link into a broken one,
// and must never affect *whether* the ad is clickable (FR-004) — only where a click already
// destined to work ends up going first. platformId/adTypeId are always present on
// PlacementIdentity (validated upstream by the Orchestrator), so they're not independently
// checked here.
//
// adConfigId is coerced with asSafeString() before use, same as every other opaque,
// upstream-sourced field in this file (FR-010) — isAdCandidate() in adDecisionClient.ts never
// validates its type, only that creative/width/height are present, so a schema-drifted or
// malformed response (adConfigId as a number/object) must degrade to the direct link, not get
// silently stringified into a broken /click URL (e.g. "adConfigId=%5Bobject+Object%5D") that
// ad-serve-api's own contract would then 400 on — a real regression for the viewer, caught in
// review.
function resolveClickHref(
  safeHref: string | null,
  adConfigId: unknown,
  impressionId: unknown,
  placement: PlacementIdentity,
  apiBaseUrl: string,
  sessionId: string | undefined,
): string | null {
  if (safeHref === null) {
    return null;
  }
  const safeAdConfigId = asSafeString(adConfigId);
  if (!safeAdConfigId || !apiBaseUrl) {
    return safeHref;
  }
  // impressionId (feature 014/007) gets the same coercion as adConfigId above — it's equally
  // opaque, upstream-sourced, and never validated by isAdCandidate() in adDecisionClient.ts, so a
  // schema-drifted response must degrade to "omit it" rather than stringify garbage into the URL.
  const safeImpressionId = asSafeString(impressionId);
  return buildTrackingUrl(apiBaseUrl, "click", {
    platformId: placement.platformId,
    adTypeId: placement.adTypeId,
    adConfigId: safeAdConfigId,
    impressionId: safeImpressionId || undefined,
    // sessionId (feature 008) is this SDK's own already-trusted, already-string value (originated
    // by getOrCreateSessionId, never sourced from an untrusted response) — no asSafeString
    // coercion needed, unlike impressionId/adConfigId above.
    sessionId,
  });
}

// A small, generic "image" glyph for the background placeholder — hand-drawn
// rather than pulled from an icon library, which wouldn't be portable into a
// plain HTML string anyway (research.md).
function buildPlaceholderIcon(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.6"/>
    <circle cx="8.5" cy="10" r="1.6" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.6"/>
    <path d="M4 16l5-4.5 3.5 3 3-2.5L20 16" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// The response is untrusted, so only a name found in this table reaches the style (spec 014). The
// same nine names and anchors are in adconfig and ad-serve-api.
const BACKGROUND_OBJECT_POSITIONS: Readonly<Record<string, string>> = {
  "top-left": "left top",
  top: "center top",
  "top-right": "right top",
  left: "left center",
  center: "center center",
  right: "right center",
  "bottom-left": "left bottom",
  bottom: "center bottom",
  "bottom-right": "right bottom",
};

function backgroundObjectPosition(value: unknown): string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BACKGROUND_OBJECT_POSITIONS, value)
    ? BACKGROUND_OBJECT_POSITIONS[value]
    : BACKGROUND_OBJECT_POSITIONS.center;
}

const GRADIENT = "linear-gradient(135deg,#7dd3fc,#0284c7)";

function percentBox(box: LayoutBox): string {
  return `left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%;`;
}

// As many lines as the text box has room for (up to three), and a word longer than the box breaks
// rather than overflows (spec 018 FR-008).
function clampedTextStyle(lines: number): string {
  return `display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;min-width:0;max-width:100%;`;
}

// The geometry counts the button as 22px tall and the headline line as 18px, so in a layout the button is
// one line of 16px (plus its 3px padding) that is cut with an ellipsis, and the headline line is 18px.
const ONE_LINE_CTA_STYLE = "max-width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
const FIXED_HEIGHT_CTA_STYLE = `line-height:16px;${ONE_LINE_CTA_STYLE}`;

// Everything below is already escaped or computed here; the layout name itself never reaches this
// function, only the numbers and flags its geometry produced (spec 018 FR-005).
interface LayoutParts {
  geometry: LayoutGeometry;
  adWidth: number;
  adHeight: number;
  wrapperTag: string;
  wrapperAttrs: string;
  ariaAttr: string;
  backgroundImage: string;
  backgroundPosition: string;
  logo: string;
  headline: string;
  headlineColor: string;
  headlineFont: string;
  cta: string;
}

function buildLayoutMarkup(parts: LayoutParts): string {
  const { geometry } = parts;

  let imageBox = "";
  if (geometry.image) {
    const inner = parts.backgroundImage
      ? `<img src="${parts.backgroundImage}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${parts.backgroundPosition};" />`
      : geometry.showPlaceholder
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${buildPlaceholderIcon(
            Math.min(
              (parts.adWidth * geometry.image.width) / 100,
              (parts.adHeight * geometry.image.height) / 100,
            ) / 3,
          )}</div>`
        : "";
    imageBox = inner ? `<div style="position:absolute;overflow:hidden;${percentBox(geometry.image)}">${inner}</div>` : "";
  }

  const align = geometry.centered ? "center" : "flex-start";
  const textAlign = geometry.centered ? "center" : "left";
  const scrim = geometry.scrim ? "background-color:rgba(0,0,0,0.45);" : "";
  const headline = parts.headline
    ? `<span style="font-size:14px;font-weight:700;color:${parts.headlineColor};font-family:${parts.headlineFont};line-height:18px;${clampedTextStyle(geometry.headlineLines)}">${parts.headline}</span>`
    : "";
  const textBox = `<div style="position:absolute;box-sizing:border-box;${percentBox(geometry.text)}display:flex;flex-direction:column;justify-content:center;align-items:${align};text-align:${textAlign};gap:4px;padding:8px;overflow:hidden;${scrim}">
        ${geometry.showLogo ? parts.logo : ""}
        ${headline}
        ${geometry.showCta ? parts.cta : ""}
      </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;">
    <${parts.wrapperTag} ${parts.wrapperAttrs}${parts.ariaAttr} style="position:absolute;inset:0;box-sizing:border-box;overflow:hidden;text-decoration:none;background:${GRADIENT};">
      ${imageBox}
      ${textBox}
    </${parts.wrapperTag}>
  </body></html>`;
}

function buildCreativeMarkup(
  ad: AdCandidate,
  apiBaseUrl: string,
  placement: PlacementIdentity,
  sessionId: string | undefined,
): string {
  const r: ResolvedAdCreativeRender =
    typeof ad.resolvedRender === "object" && ad.resolvedRender !== null ? ad.resolvedRender : {};

  const headline = escapeForMarkup(asSafeString(r.headlineText));
  const ctaText = escapeForMarkup(asSafeString(r.ctaText));
  const ariaLabel = escapeForMarkup(asSafeString(r.ariaLabel));

  // Defaults mirror adconfig's own preview defaults (white headline text,
  // sky-blue CTA text) so a degraded/unset case still looks intentional
  // rather than arbitrary.
  const headlineColor = asSafeCssColor(r.headlineTextColor, "#ffffff");
  const headlineFont = asSafeCssValue(r.headlineFontFamily, "inherit");
  const ctaColor = asSafeCssColor(r.ctaTextColor, "#0369a1");
  const ctaFont = asSafeCssValue(r.ctaFontFamily, "inherit");
  // Unlike the logo, a *shown* CTA always has a background — no separate
  // enable/disable flag for the background itself (FR-004, US3, spec 003).
  // Whether the CTA renders at all is a separate, newer question that spec
  // never had to answer: ctaText always carried real content back then
  // (genuine text or ad-serve-api's own now-removed "Shop Now" fallback —
  // see ad-serve-api's adCreativeTemplate.ts). Now that a deliberately blank
  // CTA can reach here, rendering the button pill anyway would show an
  // empty colored shape to real visitors — the same class of bug just fixed
  // for the headline, which has no background and so stayed harmless when
  // empty.
  const ctaBackground = asSafeCssColor(r.ctaBackgroundColor, "#ffffff");
  const buildCta = (extraStyle: string) =>
    ctaText
      ? `<span role="button" style="border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;color:${ctaColor};background-color:${ctaBackground};font-family:${ctaFont};${extraStyle}">${ctaText}</span>`
      : "";
  const hasLogoImage = hasResolvedImage(r.hasLogoImage, r.logoImageDataUrl);
  // A classic headline that does not fit is cut to the lines that do and a long button label stays on one line
  // (spec 020); null keeps the markup as it was.
  const classicLines = classicHeadlineLines(ad.height, { hasLogo: hasLogoImage, hasCta: Boolean(ctaText) });
  const cta = buildCta(classicLines ? ONE_LINE_CTA_STYLE : "");
  const logoBackgroundEnabled = asSafeBoolean(r.logoBackgroundEnabled, true);
  const logoBackgroundColor = asSafeCssColor(r.logoBackgroundColor, "#ffffff");
  const logo = hasLogoImage
    ? `<div style="display:inline-flex;align-items:center;overflow:hidden;border-radius:4px;padding:2px 5px;${
        logoBackgroundEnabled ? `background-color:${logoBackgroundColor};` : ""
      }">
        <img src="${escapeForMarkup(asSafeString(r.logoImageDataUrl))}" alt="" style="height:14px;max-width:40px;object-fit:contain;display:block;" />
      </div>`
    : "";

  const hasBackgroundImage = hasResolvedImage(r.hasBackgroundImage, r.backgroundImageDataUrl);
  // If iconSize is missing/invalid, compute the same formula adconfig itself
  // uses (min(width, height) / 3) so the degraded case still looks
  // consistent with the normal one (research.md).
  const iconSize = asSafePositiveNumber(r.iconSize) ?? Math.min(ad.width, ad.height) / 3;
  // Rendered as an <img> (like the logo already is), not a CSS
  // `background-image: url(...)`: embedding untrusted data inside a quoted
  // CSS string via string concatenation is unsafe — HTML-escaping a `'`
  // survives the browser's HTML-attribute-value entity decoding and comes
  // back as a literal quote by the time the CSS engine parses the style
  // attribute's content, letting it break out of the url() token. An <img
  // src> has no such second parsing pass to exploit.
  const backgroundLayer = hasBackgroundImage
    ? `<img src="${escapeForMarkup(asSafeString(r.backgroundImageDataUrl))}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${backgroundObjectPosition(r.backgroundImagePosition)};" />`
    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${buildPlaceholderIcon(iconSize)}</div>`;

  const isLinked = asSafeBoolean(r.isLinked, false);
  const safeHref = isLinked ? toSafeHref(asSafeString(r.linkUrl)) : null;
  // Whether the ad is clickable at all is still decided by safeHref alone (FR-004, unchanged) —
  // resolveClickHref only ever changes *where* an already-clickable ad points, routing through
  // ad-serve-api's click endpoint when possible and falling back to safeHref itself otherwise
  // (feature 004, FR-003).
  const clickHref = resolveClickHref(
    safeHref,
    ad.adConfigId,
    ad.impressionId,
    placement,
    apiBaseUrl,
    sessionId,
  );
  // tag and attrs are derived together, not via separate parallel ternaries
  // on the same condition, so they can never diverge into a mismatched
  // open/close tag pair (code review round 2). The non-interactive case uses
  // role="group" rather than role="img": the wrapper's own descendants
  // (headline, CTA) are real, meaningful text, and role="img" would flatten
  // them out of the accessibility tree as if the whole thing were one opaque
  // image, silently hiding that text from screen readers (code review
  // round 2 — a real regression, not merely a style preference).
  const wrapper = clickHref
    ? { tag: "a", attrs: `href="${escapeForMarkup(clickHref)}" target="_blank" rel="noopener noreferrer"` }
    : { tag: "div", attrs: `role="group"` };
  const ariaAttr = ariaLabel ? ` aria-label="${ariaLabel}"` : "";

  const geometry = layoutGeometry(normalizeLayout(r.layout), ad.width, ad.height);
  if (geometry) {
    return buildLayoutMarkup({
      geometry,
      adWidth: ad.width,
      adHeight: ad.height,
      wrapperTag: wrapper.tag,
      wrapperAttrs: wrapper.attrs,
      ariaAttr,
      backgroundImage: hasBackgroundImage ? escapeForMarkup(asSafeString(r.backgroundImageDataUrl)) : "",
      backgroundPosition: backgroundObjectPosition(r.backgroundImagePosition),
      logo,
      headline,
      headlineColor,
      headlineFont,
      cta: buildCta(FIXED_HEIGHT_CTA_STYLE),
    });
  }

  // Too short for the whole classic stack (spec 019): the same wrapper, but the logo and button are left out
  // when they do not fit and the headline is cut to the lines that do, as in the layouts. Taller ads use the
  // template below, which is unchanged.
  const short = normalizeLayout(r.layout) === "classic" ? classicFit(ad.height) : null;
  if (short) {
    const shortHeadline = headline
      ? `<span style="font-size:14px;font-weight:700;color:${headlineColor};font-family:${headlineFont};line-height:18px;${clampedTextStyle(short.headlineLines)}">${headline}</span>`
      : "";
    return `<!DOCTYPE html><html><body style="margin:0;">
    <${wrapper.tag} ${wrapper.attrs}${ariaAttr} style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;box-sizing:border-box;padding:8px;overflow:hidden;text-decoration:none;background:${GRADIENT};">
      ${backgroundLayer}
      <div style="position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
        ${shortHeadline}
        ${short.showCta ? buildCta(FIXED_HEIGHT_CTA_STYLE) : ""}
      </div>
    </${wrapper.tag}>
  </body></html>`;
  }

  // Layout mirrors adconfig's own preview (research.md): background layer,
  // then a top row (logo only — the disclosure icon is deliberately
  // omitted, it's non-data-driven chrome) and a bottom block (headline, then
  // the CTA as a <span role="button"> rather than a real <button> — nesting
  // interactive content inside this wrapper's own <a> would be invalid
  // HTML5 and leaves keyboard/screen-reader activation undefined).
  // The wrapper fills the iframe via position:absolute;inset:0 against the
  // initial containing block (sized by the iframe's own width/height
  // attributes in renderAd), not via width/height:100% — a percentage
  // height only resolves through a chain of non-auto-height ancestors, so
  // that approach would need <html> and <body> to separately opt in too
  // (and silently break again if a <head> or extra wrapper layer is ever
  // inserted between them and here).
  return `<!DOCTYPE html><html><body style="margin:0;">
    <${wrapper.tag} ${wrapper.attrs}${ariaAttr} style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;padding:8px;overflow:hidden;text-decoration:none;background:${GRADIENT};">
      ${backgroundLayer}
      <div style="position:relative;display:flex;align-items:flex-start;">${logo}</div>
      <div style="position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
        <span style="font-size:14px;font-weight:700;color:${headlineColor};font-family:${headlineFont};${classicLines ? clampedTextStyle(classicLines) : ""}">${headline}</span>
        ${cta}
      </div>
    </${wrapper.tag}>
  </body></html>`;
}

export function createAdRenderer(documentImpl: Document, apiBaseUrl: string) {
  function renderAd(
    slotElement: Element,
    ad: AdCandidate,
    placement: PlacementIdentity,
    sessionId?: string,
  ): void {
    const iframe = documentImpl.createElement("iframe");
    // Narrowest sandbox that satisfies a static text/image/link creative
    // (research.md): no allow-scripts, no allow-same-origin.
    // allow-popups-to-escape-sandbox is required alongside allow-popups: per
    // the WHATWG popup-inheritance rule, a popup opened from a sandboxed
    // frame otherwise inherits that sandbox's restrictions itself, which
    // would break the advertiser's own landing page (no scripts, unique
    // origin) the moment a visitor actually clicks through.
    iframe.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    iframe.setAttribute("width", String(ad.width));
    iframe.setAttribute("height", String(ad.height));
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("srcdoc", buildCreativeMarkup(ad, apiBaseUrl, placement, sessionId));
    slotElement.appendChild(iframe);
  }

  return { renderAd };
}
