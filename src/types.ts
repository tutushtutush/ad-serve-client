// Shapes shared across layers, mirroring ad-serve-api's GET /ads contract and data-model.md.

export interface AdSlotConfig {
  platformId: string;
  adTypeId: string;
  country?: string;
  deviceType?: string;
  // IAB Content Taxonomy code describing the page's content (feature 010), e.g. "IAB1-6" (Music).
  // Passed through opaquely like country/deviceType — never validated here.
  category?: string;
  element: Element;
}

export interface AdDecisionRequest {
  platformId: string;
  adTypeId: string;
  country?: string;
  deviceType?: string;
  category?: string;
  // This SDK's own originated visitor session identifier (feature 008) — not parsed from a slot's
  // data-* attributes like the other fields here; the Orchestrator supplies it uniformly for
  // every request, not AdSlotConfig/parseSlotConfig. See adOrchestrator.ts.
  sessionId?: string;
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
  // ad-serve-api's identifier for the winning ad config — used to build a click-tracking URL
  // (feature 004), never for rendering itself. Optional, same degrade-safely treatment as every
  // other field here: absence falls back to a direct advertiser link, it never blocks rendering.
  adConfigId?: string;
  // ad-serve-api's identifier for this specific ad serving (feature 014), echoed back on
  // click/viewable-impression reports so ad-serve-api can dedup repeated reports for the same
  // serving. Optional and opaque, same treatment as adConfigId: absence just means no dedup key
  // is sent, it never blocks tracking or rendering (feature 007).
  impressionId?: string;
}

export type AdDecisionResult = { status: "filled"; ad: AdCandidate } | { status: "empty" };

// One slot's outcome within a batch call (feature 012): the same two results a single request can
// give, plus "failed" for an entry the server reported as an error or invalid, so only that slot
// falls back to its own single request.
export type BatchEntryResult = AdDecisionResult | { status: "failed" };

// The request details a whole batch carries once, shared by every placement in it.
export interface BatchSharedFields {
  country?: string;
  deviceType?: string;
  category?: string;
  sessionId?: string;
}

// Just the two fields needed to build a click URL (feature 004) — not the full
// AdDecisionRequest: ad-serve-api's /click endpoint doesn't accept country/deviceType.
export interface PlacementIdentity {
  platformId: string;
  adTypeId: string;
}

// A host page's declaration of what the page is about (feature 010). Entries are plain words or
// IAB codes, passed through to ad-serve-api untouched; `categories` absent or empty clears it.
export interface SetContextPayload {
  categories?: unknown;
}

// An entry a host page may push on window.adServe.q besides a plain callback: `[name, payload]`.
export type QueuedCommand = [name: string, payload?: unknown];
