# Data Model: Echo the Per-Impression Idempotency Key on Tracking Reports

No new entities, no persistence. This feature extends three existing in-memory shapes with one
optional field each, all carrying the same opaque string value end to end.

## Extended: `AdCandidate` (`src/types.ts`)

```ts
export interface AdCandidate {
  creative: AdCreative;
  width: number;
  height: number;
  resolvedRender?: ResolvedAdCreativeRender;
  adConfigId?: string;
  impressionId?: string; // NEW — ad-serve-api's serving identifier (feature 014), opaque,
                          // present whenever ad-serve-api's response included it
}
```

`impressionId` is absent whenever the decision response omitted it (an older ad-serve-api, or
`{ad: null}` — no candidate exists at all in that case). It is never independently validated
client-side beyond the `asSafeString()` coercion applied at each send site (research.md Decision
4) — the same trust/coercion level as `adConfigId`.

## Extended: `TrackedSlot` (`src/orchestrator/adOrchestrator.ts`, internal)

No field changes. `TrackedSlot.ad: AdCandidate | null` already carries whatever `AdCandidate`
declares (research.md Decision 3) — `impressionId` is available via `slot.ad?.impressionId`
wherever `slot.ad?.adConfigId` is already read today.

## Extended: `ViewableImpressionReport` (`src/client/viewableImpressionClient.ts`)

```ts
export interface ViewableImpressionReport {
  platformId: string;
  adTypeId: string;
  adConfigId: string;
  impressionId?: string; // NEW
}
```

## Extended: `buildTrackingUrl`'s params (`src/utils/buildTrackingUrl.ts`)

```ts
export function buildTrackingUrl(
  baseUrl: string,
  path: string,
  params: { platformId: string; adTypeId: string; adConfigId: string; impressionId?: string },
): string
```

`impressionId` is appended to the built query string only when it's a non-empty string
(research.md Decision 5) — otherwise the URL is byte-identical to today's output.

## Unchanged

- `AdDecisionResult`, `AdDecisionRequest`, `PlacementIdentity` — no change; `impressionId` is
  carried on `AdCandidate` alone, not on the request/placement side.
- `adDecisionClient.ts`'s `isAdCandidate()` type guard — unchanged (research.md Decision 2).
- `ad-serve-api`'s own schema/endpoints — this feature is client-only; see spec.md Assumptions.
