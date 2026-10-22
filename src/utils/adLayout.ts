// How an ad's image, logo, headline and button are arranged (spec 018, adconfig spec 101). The
// response is untrusted, so a layout is only ever a name looked up in this fixed list and never
// reaches the markup itself. The same names and rules are in adconfig and ad-serve-api; the shared
// table is in specs/018-ad-layout-presets/contracts/resolved-render.md.
export type AdLayout = "classic" | "image-left" | "image-top" | "overlay" | "text-only";

export const AD_LAYOUTS: readonly AdLayout[] = ["classic", "image-left", "image-top", "overlay", "text-only"];

// An own-name check, not a bare `in`, so "constructor" or "__proto__" are not mistaken for layouts.
export function normalizeLayout(value: unknown): AdLayout {
  return typeof value === "string" && AD_LAYOUTS.includes(value as AdLayout) ? (value as AdLayout) : "classic";
}

/** A box as a share (0 to 100) of the ad's width and height. */
export interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutGeometry {
  /** Null when the layout shows no image. */
  image: LayoutBox | null;
  text: LayoutBox;
  centered: boolean;
  /** A dark layer behind the text, so it stays readable on top of an image. */
  scrim: boolean;
  /** Only the two layouts that put an image beside the text draw the placeholder icon. */
  showPlaceholder: boolean;
  /** The logo is dropped first when the text box is too short for it. */
  showLogo: boolean;
  /** The button is dropped next, when the box cannot hold it under a line of headline. */
  showCta: boolean;
  /** How many lines of headline fit once the logo and the button have taken their space (1 to 3). */
  headlineLines: 1 | 2 | 3;
}

// Heights in px of what the text box holds (14px headline, 11px button, 14px logo); the same
// numbers are in adconfig's and ad-serve-api's tables, and in the contract.
const TEXT_BOX_PADDING = 16;
const GAP = 4;
const HEADLINE_LINE = 18;
const CTA_HEIGHT = 22;
const LOGO_HEIGHT = 18;
// Ads shorter than this have no room for a 60/40 split, so image-top is drawn side by side instead.
const SHORT_AD_HEIGHT = 100;

const FULL: LayoutBox = { left: 0, top: 0, width: 100, height: 100 };

function isPositiveSize(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// Half the width is too narrow on a tall ad, so image-left stacks like image-top; a short ad has no room
// for stacked rows, so image-top goes side by side.
function sideBySideOrStacked(layout: AdLayout, adWidth: number, adHeight: number): AdLayout {
  if (layout !== "image-left" && layout !== "image-top") return layout;
  if (adHeight > adWidth) return "image-top";
  return adHeight < SHORT_AD_HEIGHT ? "image-left" : layout;
}

/** The arrangement an ad is drawn with, or null for classic (drawn as before spec 018). */
export function layoutGeometry(layout: AdLayout, adWidth: number, adHeight: number): LayoutGeometry | null {
  if (layout === "classic" || !isPositiveSize(adWidth) || !isPositiveSize(adHeight)) return null;
  const arrangement = sideBySideOrStacked(layout, adWidth, adHeight);

  let image: LayoutBox | null;
  let text: LayoutBox;
  switch (arrangement) {
    case "image-left":
      image = { left: 0, top: 0, width: 50, height: 100 };
      text = { left: 50, top: 0, width: 50, height: 100 };
      break;
    case "image-top":
      image = { left: 0, top: 0, width: 100, height: 60 };
      text = { left: 0, top: 60, width: 100, height: 40 };
      break;
    case "overlay":
      image = FULL;
      text = FULL;
      break;
    default:
      image = null;
      text = FULL;
  }

  return {
    image,
    text,
    centered: arrangement === "overlay" || arrangement === "text-only",
    scrim: arrangement === "overlay",
    showPlaceholder: arrangement === "image-left" || arrangement === "image-top",
    ...fitText((adHeight * text.height) / 100 - TEXT_BOX_PADDING),
  };
}

type TextFit = Pick<LayoutGeometry, "showLogo" | "showCta" | "headlineLines">;

// What a text box of this inner height (padding already taken off) can hold: the button when there is room
// for one line of headline above it, the logo when there is room for everything, and the rest for headline.
function fitText(inner: number): TextFit {
  const showCta = inner >= HEADLINE_LINE + GAP + CTA_HEIGHT;
  const showLogo = showCta && inner >= LOGO_HEIGHT + GAP + HEADLINE_LINE + GAP + CTA_HEIGHT;
  const spaceForHeadline = inner - (showLogo ? LOGO_HEIGHT + GAP : 0) - (showCta ? CTA_HEIGHT + GAP : 0);
  const headlineLines = Math.min(3, Math.max(1, Math.floor(spaceForHeadline / HEADLINE_LINE))) as 1 | 2 | 3;
  return { showLogo, showCta, headlineLines };
}

/**
 * How classic is drawn on a short ad (spec 019, from adconfig spec 109), or null when it holds everything and
 * is drawn exactly as before. Decided by the ad's height alone, so the preview and the served ad always agree
 * and an ad that already fits keeps its markup byte for byte.
 */
export function classicFit(adHeight: number): TextFit | null {
  if (!isPositiveSize(adHeight)) return null;
  const fit = fitText(adHeight - TEXT_BOX_PADDING);
  return fit.showLogo ? null : fit;
}

// Classic sets no line height, so in the SDK's iframe (no base style, line height "normal") a headline line is
// 17px and the button 19px, where adconfig's preview draws 21px and 22px. The largest values measured in the
// default, sans, serif and mono fonts, so a font with a taller line is still inside (spec 020, adconfig spec 110).
const CLASSIC_HEADLINE_LINE = 17;
const CLASSIC_BUTTON_HEIGHT = 19;

/**
 * How many headline lines classic may draw on an ad of 82px and over (spec 020), or null when it draws no limit
 * (a short ad has the rule of spec 019, and a missing size keeps today's markup). There is no cap at three: the
 * limit is only the room left after the logo and the button, so a headline that fits today is still shown whole.
 */
export function classicHeadlineLines(adHeight: number, parts: { hasLogo: boolean; hasCta: boolean }): number | null {
  if (!isPositiveSize(adHeight) || classicFit(adHeight)) return null;
  const room =
    adHeight - TEXT_BOX_PADDING - (parts.hasLogo ? LOGO_HEIGHT : 0) - (parts.hasCta ? GAP + CLASSIC_BUTTON_HEIGHT : 0);
  return Math.max(1, Math.floor(room / CLASSIC_HEADLINE_LINE));
}
