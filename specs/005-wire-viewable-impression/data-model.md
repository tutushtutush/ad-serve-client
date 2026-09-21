# Phase 1 Data Model: Wire Up Viewable Impression Tracking

No new persisted entity (per spec's Key Entities: none) — this feature adds two new modules and
extends the Orchestrator's dependencies and per-slot bookkeeping.

## `ViewabilityDetectorLike` (new interface, `src/orchestrator/adOrchestrator.ts`)

```ts
export interface ViewabilityDetectorLike {
  // Starts watching `element` for the IAB viewability condition (≥50% visible, continuously, for
  // ≥1s). Calls `onViewable` at most once, the first time the condition is satisfied. Returns a
  // `stop()` function that cancels the watch — safe to call at any time, including after
  // `onViewable` has already fired (a no-op then).
  watch(element: Element, onViewable: () => void): () => void;
}
```

## `createViewabilityDetector` (new factory, `src/utils/viewabilityDetector.ts`)

```ts
export function createViewabilityDetector(
  IntersectionObserverImpl: typeof IntersectionObserver | undefined,
): ViewabilityDetectorLike;
```

`IntersectionObserverImpl` is injected (Constitution Principle III's spirit, applied here even
though Utility isn't strictly covered by it, for the same testability reason and because a real
browser global must never be reached for internally) — `undefined` when the runtime doesn't support
it (FR-005), in which case `watch()` returns a no-op `stop` and never calls `onViewable`.

## `ViewableImpressionReport` / `ViewableImpressionClientLike` (new, `src/client/viewableImpressionClient.ts`)

```ts
export interface ViewableImpressionReport {
  platformId: string;
  adTypeId: string;
  adConfigId: string;
}

export interface ViewableImpressionClientLike {
  reportViewableImpression(report: ViewableImpressionReport): void;
}

export function createViewableImpressionClient(
  baseUrl: string,
  sendBeaconImpl: ((url: string) => boolean) | undefined,
  fetchImpl: ((url: string, init: { method: string; keepalive: boolean }) => unknown) | undefined,
): ViewableImpressionClientLike;
```

Mirrors ad-serve-api's `contracts/viewable-impression-endpoint.md` exactly: `POST
{baseUrl}/viewable-impression?platformId=&adTypeId=&adConfigId=`, no body, response never read
(matches `navigator.sendBeacon()`'s own contract — see research.md). `reportViewableImpression` is
synchronous and void: nothing downstream of it depends on the network call's outcome, so there is
nothing for a caller to `await` or branch on (same posture ad-serve-api's own handler independently
converged on for this same endpoint, per its round-2 code review).

## `AdOrchestratorDeps` (extended, `src/orchestrator/adOrchestrator.ts`)

```ts
export interface AdOrchestratorDeps {
  client: AdDecisionClientLike;
  renderer: AdRendererLike;
  viewabilityDetector?: ViewabilityDetectorLike;   // NEW, optional
  trackingClient?: ViewableImpressionClientLike;   // NEW, optional
}
```

Both new dependencies are optional, not required like `client`/`renderer` — an orchestrator
constructed without them simply never starts a viewability watch (same code path as FR-004's
missing-`adConfigId` case), rather than requiring every existing and future test of unrelated
Orchestrator behavior to also supply viewability fakes. In real usage `index.ts` always
constructs and injects both (T005) — `createViewabilityDetector`/`createViewableImpressionClient`
never fail to construct even when the underlying browser API is itself unavailable, they just
produce a detector/client that no-ops internally (FR-005) — so this optionality exists for
testability and graceful degradation, not because production ever omits them.

## `TrackedSlot` (extended, `src/orchestrator/adOrchestrator.ts`)

```ts
interface TrackedSlot {
  // ...existing fields unchanged...
  // The active viewability watch's stop function, or null when none is pending (never started,
  // already fired, or already stopped). Stopped and reset to null on redisplay (a fresh watch
  // starts for the new element) and whenever the slot is marked `resolved` (FR-007).
  stopViewabilityWatch: (() => void) | null;
}
```

## Wiring (`src/index.ts`)

```ts
const viewabilityDetector = createViewabilityDetector(window.IntersectionObserver);
const trackingClient = createViewableImpressionClient(
  baseUrl,
  typeof navigator.sendBeacon === "function" ? navigator.sendBeacon.bind(navigator) : undefined,
  window.fetch.bind(window),
);
const orchestrator = createAdOrchestrator({ client, renderer, viewabilityDetector, trackingClient });
```

`window.IntersectionObserver` is `undefined` in a browser that doesn't support it — passed through
as-is rather than feature-detected with a truthiness check, so `createViewabilityDetector` is the
single place that decides what "unsupported" means (FR-005).
