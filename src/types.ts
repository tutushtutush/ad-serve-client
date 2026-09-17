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

export interface AdCreative {
  backgroundImageDataUrl: string | null;
  logoImageDataUrl: string | null;
  logoBackgroundEnabled: boolean;
  logoBackgroundColor: string;
  headline: string;
  ctaText: string;
  linkUrl: string;
  altText: string;
  headlineTextColor: string;
  headlineFontFamily: string;
  ctaTextColor: string;
  ctaFontFamily: string;
  ctaBackgroundColor: string;
}

export interface AdCandidate {
  creative: AdCreative;
  width: number;
  height: number;
}

export type AdDecisionResult = { status: "filled"; ad: AdCandidate } | { status: "empty" };
