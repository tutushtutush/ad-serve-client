# Data Model: Originate and Attach a Visitor Session Identifier

## New Utility (`src/utils/sessionId.ts`)

```ts
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Returns the persisted session identifier if one already exists, otherwise originates one and
// persists it — or undefined if storage/randomUUID is unavailable or any step throws (research.md
// Decision 4). Never mutates storage more than once per call: reads first, writes only when
// nothing was already there.
export function getOrCreateSessionId(
  storage: SessionStorageLike | undefined,
  randomUUIDImpl: (() => string) | undefined,
): string | undefined;
```

A single well-known storage key (e.g. `"adServeSessionId"`) is used, private to this module — not
exported, since no other module has a reason to read or write it directly.

## Extended request/report shapes

```ts
// types.ts
export interface AdDecisionRequest {
  platformId: string;
  adTypeId: string;
  country?: string;
  deviceType?: string;
  sessionId?: string; // NEW
}
```

```ts
// client/viewableImpressionClient.ts
export interface ViewableImpressionReport {
  platformId: string;
  adTypeId: string;
  adConfigId: string;
  impressionId?: string;
  sessionId?: string; // NEW
}
```

```ts
// utils/buildTrackingUrl.ts
export function buildTrackingUrl(
  baseUrl: string,
  path: string,
  params: {
    platformId: string;
    adTypeId: string;
    adConfigId: string;
    impressionId?: string;
    sessionId?: string; // NEW — appended only when present, same treatment as impressionId
  },
): string;
```

## Extended Orchestrator/Renderer signatures

```ts
// orchestrator/adOrchestrator.ts
export interface AdOrchestratorDeps {
  client: AdDecisionClientLike;
  renderer: AdRendererLike;
  viewabilityDetector?: ViewabilityDetectorLike;
  trackingClient?: ViewableImpressionClientLike;
  sessionId?: string; // NEW — read once in index.ts, forwarded to every request this run makes
}

export interface AdRendererLike {
  // NEW 4th parameter — forwarded to resolveClickHref -> buildTrackingUrl, same optional/
  // degrade-silently treatment as every other opaque field already threaded through here.
  renderAd(slotElement: Element, ad: AdCandidate, placement: PlacementIdentity, sessionId?: string): void;
}
```

Every `client.requestAd({...slot.config, sessionId})` and
`trackingClient.reportViewableImpression({..., sessionId})` call site gains `sessionId` from the
Orchestrator's own `sessionId` dependency — `slot.config` itself (an `AdDecisionRequest`) is not
mutated to carry it, since `sessionId` is a page-load-scoped value, not a per-slot config value
parsed from the DOM (unlike `platformId`/`adTypeId`/`country`/`deviceType`).

## Key Entities (from spec.md)

- **Visitor Session Identifier**: An opaque string, originated at most once per page load (reusing
  a persisted value when one exists) and held as a single in-memory value for that page load's
  entire `AdOrchestratorDeps`. Not retained on any per-slot or per-serving state — every slot and
  every request during one page load reads the same value from the Orchestrator's own
  dependencies, never its own copy.
