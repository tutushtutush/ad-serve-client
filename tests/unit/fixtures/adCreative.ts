import type { AdCandidate, AdCreative } from "../../../src/types";

export function makeAdCreative(overrides: Partial<AdCreative> = {}): AdCreative {
  return {
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
  };
}

export function makeAd(overrides: Partial<AdCreative> = {}): AdCandidate {
  return {
    creative: makeAdCreative(overrides),
    width: 300,
    height: 250,
  };
}
