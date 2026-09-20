// Shapes shared across layers, mirroring ad-serve-api's GET /ads contract and data-model.md.

export interface AdSlotConfig {
  platformId: string;
  adTypeId: string;
  country?: string;
  deviceType?: string;
  element: Element;
}

export interface AdDecisionRequest {
  platformId: string;
  adTypeId: string;
  country?: string;
  deviceType?: string;
}

// Passed through opaquely from ad-serve-api's own store (see that repo's
// AdCreative/data-model.md): every field is optional because the upstream
// data only carries whatever was actually set, not every field backfilled
// with a default — ad-serve-client must not assume a field's presence.
export interface AdCreative {
  backgroundImageDataUrl?: string | null;
  logoImageDataUrl?: string | null;
  logoBackgroundEnabled?: boolean;
  logoBackgroundColor?: string;
  headline?: string;
  ctaText?: string;
  linkUrl?: string;
  altText?: string;
  headlineTextColor?: string;
  headlineFontFamily?: string;
  ctaTextColor?: string;
  ctaFontFamily?: string;
  ctaBackgroundColor?: string;
}

// Every rendering *decision* already resolved server-side (ad-serve-api
// feature 006, vendored from adconfig) — fallback text applied, colors/fonts
// resolved, logo/background presence decided, clickability decided. Every
// field is treated by the Renderer as untrusted and independently
// defaultable: this type describes the wire shape, not a guarantee about
// what a given response actually contains (FR-010, feature 003).
export interface ResolvedAdCreativeRender {
  headlineText?: string;
  ctaText?: string;
  headlineTextColor?: string;
  headlineFontFamily?: string;
  ctaTextColor?: string;
  ctaFontFamily?: string;
  ctaBackgroundColor?: string;
  hasLogoImage?: boolean;
  logoImageDataUrl?: string;
  logoBackgroundEnabled?: boolean;
  logoBackgroundColor?: string;
  hasBackgroundImage?: boolean;
  backgroundImageDataUrl?: string;
  isLinked?: boolean;
  linkUrl?: string;
  ariaLabel?: string;
  iconSize?: number;
}

export interface AdCandidate {
  creative: AdCreative;
  width: number;
  height: number;
  // Optional: absent on an incomplete/older ad-serve-api response — the
  // degrade-safely case (FR-010, feature 003).
  resolvedRender?: ResolvedAdCreativeRender;
}

export type AdDecisionResult = { status: "filled"; ad: AdCandidate } | { status: "empty" };
