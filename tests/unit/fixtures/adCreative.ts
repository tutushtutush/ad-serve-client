import type { AdCandidate, AdCreative, ResolvedAdCreativeRender } from "../../../src/types";

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

export function makeResolvedRender(
  overrides: Partial<ResolvedAdCreativeRender> = {},
): ResolvedAdCreativeRender {
  return {
    headlineText: "Summer Sale",
    ctaText: "Shop Now",
    headlineTextColor: undefined,
    headlineFontFamily: "inherit",
    ctaTextColor: undefined,
    ctaFontFamily: "inherit",
    ctaBackgroundColor: "#0055ff",
    hasLogoImage: false,
    logoImageDataUrl: undefined,
    logoBackgroundEnabled: true,
    logoBackgroundColor: "#ffffff",
    hasBackgroundImage: false,
    backgroundImageDataUrl: undefined,
    isLinked: true,
    linkUrl: "https://example.com/sale",
    ariaLabel: "Summer Sale banner",
    iconSize: 83.333,
    ...overrides,
  };
}

export function makeAdWithResolvedRender(overrides: Partial<ResolvedAdCreativeRender> = {}): AdCandidate {
  return {
    creative: makeAdCreative(),
    width: 300,
    height: 250,
    resolvedRender: makeResolvedRender(overrides),
  };
}
