import { escapeForMarkup } from "../utils/escapeForMarkup";
import type { AdCandidate, AdCreative } from "../types";

// creative's fields are opaque and optional (types.ts) — ad-serve-api only
// includes whatever a campaign actually set, not every field backfilled
// with a default. Coerce anything non-string (including undefined/null) to
// "" before escaping, so a sparse or unexpectedly-shaped creative degrades
// to blank text/a safe fallback instead of crashing.
function asSafeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Only allow http(s) links — the creative's linkUrl is external, untrusted
// data, and rendering it as an href must never permit a javascript: (or
// other) scheme escape.
function toSafeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

function buildCreativeMarkup(creative: AdCreative): string {
  const headline = escapeForMarkup(asSafeString(creative.headline));
  const ctaText = escapeForMarkup(asSafeString(creative.ctaText));
  const altText = escapeForMarkup(asSafeString(creative.altText));
  const href = escapeForMarkup(toSafeHref(asSafeString(creative.linkUrl)));
  const backgroundImageDataUrl = asSafeString(creative.backgroundImageDataUrl);
  const image = backgroundImageDataUrl
    ? `<img src="${escapeForMarkup(backgroundImageDataUrl)}" alt="${altText}" style="display:block;width:100%;height:100%;object-fit:cover;" />`
    : "";

  // The CTA is rendered as a <span> styled to look like a button, not a real
  // <button>: nesting interactive content (a <button>) inside another
  // interactive element (this <a>) is invalid HTML5 and leaves keyboard/
  // screen-reader activation behavior undefined. A single <a> wrapping
  // everything keeps one unambiguous, fully-keyboard-accessible target.
  return `<!DOCTYPE html><html><body style="margin:0;">
    <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:block;height:100%;text-decoration:none;">
      ${image}
      <div>${headline}</div>
      <span role="button">${ctaText}</span>
    </a>
  </body></html>`;
}

export function createAdRenderer(documentImpl: Document) {
  function renderAd(slotElement: Element, ad: AdCandidate): void {
    const iframe = documentImpl.createElement("iframe");
    // Narrowest sandbox that satisfies a static text/image/link creative
    // (research.md): no allow-scripts, no allow-same-origin.
    iframe.setAttribute("sandbox", "allow-popups");
    iframe.setAttribute("width", String(ad.width));
    iframe.setAttribute("height", String(ad.height));
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("srcdoc", buildCreativeMarkup(ad.creative));
    slotElement.appendChild(iframe);
  }

  return { renderAd };
}
