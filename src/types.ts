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

export interface AdCandidate {
  creative: AdCreative;
  width: number;
  height: number;
}

export type AdDecisionResult = { status: "filled"; ad: AdCandidate } | { status: "empty" };
