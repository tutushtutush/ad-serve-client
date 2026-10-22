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
  /** The logo goes before any text when the text box is short. */
  showLogo: boolean;
  /** The button is dropped only when its box is shorter than the button itself. */
  showCta: boolean;
}

const MIN_LOGO_BOX_HEIGHT = 80;
const MIN_CTA_BOX_HEIGHT = 24;

const FULL: LayoutBox = { left: 0, top: 0, width: 100, height: 100 };

function isPositiveSize(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** The arrangement an ad is drawn with, or null for classic (drawn as before spec 018). */
export function layoutGeometry(layout: AdLayout, adWidth: number, adHeight: number): LayoutGeometry | null {
  if (layout === "classic" || !isPositiveSize(adWidth) || !isPositiveSize(adHeight)) return null;
  // Half the width is too narrow on a tall ad, so it stacks like image-top.
  const arrangement = layout === "image-left" && adHeight > adWidth ? "image-top" : layout;

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

  const textBoxHeight = (adHeight * text.height) / 100;
  return {
    image,
    text,
    centered: arrangement === "overlay" || arrangement === "text-only",
    scrim: arrangement === "overlay",
    showPlaceholder: arrangement === "image-left" || arrangement === "image-top",
    showLogo: textBoxHeight >= MIN_LOGO_BOX_HEIGHT,
    showCta: textBoxHeight >= MIN_CTA_BOX_HEIGHT,
  };
}
