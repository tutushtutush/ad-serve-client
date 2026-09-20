# Phase 1 Data Model: Route Clicks Through Click Tracking

No new entity — this feature extends one existing type and one existing function signature.

## `AdCandidate` (extended, `src/types.ts`)

```ts
export interface AdCandidate {
  creative: AdCreative;
  width: number;
  height: number;
  resolvedRender?: ResolvedAdCreativeRender;
  // NEW: ad-serve-api's own identifier for the winning ad config (its /ads response already
  // includes this field, unchanged by 004 — the Client just didn't type it until now). Optional,
  // same treatment as every other opaque field: absence must degrade safely (research.md), not
  // reject the ad.
  adConfigId?: string;
}
```

## `AdRendererLike.renderAd` (extended signature, `src/orchestrator/adOrchestrator.ts`)

```ts
export interface AdRendererLike {
  renderAd(slotElement: Element, ad: AdCandidate, placement: PlacementIdentity): void;
}

// Just the two fields needed to build a click URL — not the full AdDecisionRequest (no
// country/deviceType; ad-serve-api's /click contract doesn't accept them, per its own
// contracts/click-endpoint.md).
export interface PlacementIdentity {
  platformId: string;
  adTypeId: string;
}
```

Both existing call sites in `adOrchestrator.ts` (`runSlot`'s initial render, `processMutationBatch`'s
redisplay) already have `slot.config.platformId`/`slot.config.adTypeId` in scope — pass
`{ platformId: slot.config.platformId, adTypeId: slot.config.adTypeId }`.

## `createAdRenderer` (extended signature, `src/renderer/adRenderer.ts`)

```ts
export function createAdRenderer(documentImpl: Document, apiBaseUrl: string) { ... }
```

`apiBaseUrl` is injected the same way `documentImpl` already is (Constitution Principle III) —
`index.ts`'s `main()` already computes `baseUrl` for `createAdDecisionClient`; the same value is
now also passed to `createAdRenderer`.

## Click-URL resolution logic (`buildCreativeMarkup`, `src/renderer/adRenderer.ts`)

Not a new type, but the core decision this feature adds — shape only, full implementation is a
`/speckit-tasks` concern:

```ts
function resolveClickHref(
  safeHref: string | null,          // already-computed toSafeHref(linkUrl) result, unchanged
  adConfigId: string | undefined,
  platform: PlacementIdentity,
  apiBaseUrl: string,
): string | null {
  if (safeHref === null) return null;               // FR-004: unchanged clickability gate
  if (!adConfigId || !apiBaseUrl) return safeHref;   // FR-003: fall back to direct link
  return `${apiBaseUrl}/click?${new URLSearchParams({
    platformId: platform.platformId,
    adTypeId: platform.adTypeId,
    adConfigId,
  })}`;
}
```

`platform.platformId`/`adTypeId` are always present (required fields on `PlacementIdentity`,
already validated upstream by `parseSlotConfig`/`isValidPlacementIdentity`-equivalent logic in the
Orchestrator) — only `adConfigId` and `apiBaseUrl` are the two independently-optional conditions
FR-003 covers.
