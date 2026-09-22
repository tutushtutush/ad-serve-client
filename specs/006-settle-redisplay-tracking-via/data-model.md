# Phase 1 Data Model: Settle Redisplay Tracking via Wall-Clock Timeout

No new persisted entity (per spec's Key Entities: none) — this feature extends one existing
internal type in `src/orchestrator/adOrchestrator.ts`. No new interface, module, or wiring in
`index.ts`.

## New constant (`src/orchestrator/adOrchestrator.ts`)

```ts
// How long a slot may go without a mutation batch before its redisplay tracking settles anyway
// (feature 006) — a fallback alongside INITIAL_QUIET_BATCHES_REMAINING for a page that produces
// no further mutations near the slot after it's (re)rendered, so quietBatchesRemaining would
// otherwise never reach zero. Sized like viewabilityDetector.ts's MAX_WATCH_DURATION_MS.
const REDISPLAY_SETTLE_TIMEOUT_MS = 2 * 60 * 1000;
```

## `TrackedSlot` (extended)

```ts
interface TrackedSlot {
  // ...existing fields unchanged (config, groupKey, groupPosition, currentElement, resolved, ad,
  // renderedElement, redisplaysRemaining, quietBatchesRemaining, stopViewabilityWatch,
  // viewableImpressionReported)...

  // Wall-clock fallback for settleRedisplayTracking (feature 006): started/restarted every time
  // the slot is (re)rendered, alongside quietBatchesRemaining being reset. Fires
  // settleRedisplayTracking(slot) if the slot hasn't already settled/resolved via the existing
  // mutation-count path by the time REDISPLAY_SETTLE_TIMEOUT_MS elapses since the most recent
  // (re)display. Cleared (never fires) once the slot settles or resolves through any path —
  // see resolveSlot()/settleRedisplayTracking()'s updated bodies.
  settleTimer: ReturnType<typeof setTimeout> | null;
}
```

**Invariant** (mirrors `stopViewabilityWatch`'s existing documented invariant): `settleTimer` is
`null` whenever no wall-clock settle is pending for this slot — never started, already fired, or
already cleared. Every place that sets `slot.resolved = true` or otherwise ends the slot's
tracked-for-redisplay lifetime MUST also clear any pending `settleTimer`, the same discipline
already required of `stopViewabilityWatch`.

## Behavior change (`resolveSlot` / `settleRedisplayTracking` / render paths — no signature change)

No function gains a new parameter and no existing function's return type changes; this is a
body-only change to logic already private to `adOrchestrator.ts`:

- Wherever `slot.renderedElement` is (re)assigned after a successful render — `runSlot()`'s
  success path and `processMutationBatch`'s redisplay branch, the same two places
  `quietBatchesRemaining` is already reset to `INITIAL_QUIET_BATCHES_REMAINING` — the slot's
  `settleTimer` is cleared (if one was already pending from a prior render of this slot) and a new
  one is scheduled for `REDISPLAY_SETTLE_TIMEOUT_MS`.
- `resolveSlot()` and `settleRedisplayTracking()` each clear `slot.settleTimer` (if pending) in
  addition to their existing behavior, so a slot that settles/resolves via the mutation-count path
  never has a stale wall-clock timer fire afterward.
- The wall-clock timer's own callback, when it fires: no-ops if `slot.resolved` is already `true`
  (settled/resolved another way first) or if `slot.renderedElement` is no longer connected
  (a disconnect-triggered mutation batch is either already handling this slot or about to);
  otherwise calls `settleRedisplayTracking(slot)` — the exact function the quiet-batch path already
  calls, producing an identical outcome (FR-002: viewability watch is left untouched, matching
  `settleRedisplayTracking`'s existing contract).

## New notify hook (`src/orchestrator/adOrchestrator.ts`) — required for SC-001, found during planning

```ts
// Set once per run() call to that call's own disconnectIfAllResolved, so resolveSlot() and
// settleRedisplayTracking() — both defined outside run()'s closure — can still prompt the
// top-level "is everything done" check after marking a slot settled/resolved, regardless of what
// triggered it. Without this, a slot settled via the new wall-clock path (fired with no
// surrounding mutation batch to otherwise trigger that check) would never cause the top-level
// MutationObserver to actually release on a page that stays quiet — the exact resource this
// feature exists to bound.
let notifySlotSettled: (() => void) | null = null;
```

`run(root)` assigns `notifySlotSettled = disconnectIfAllResolved;` once, immediately after
`disconnectIfAllResolved` is defined (before the observer starts or any slot is processed).
`resolveSlot()` and `settleRedisplayTracking()` each call `notifySlotSettled?.()` as their last
step, after their existing behavior — a no-op when `run()` hasn't been called yet, which can't
happen in practice since nothing can mark a slot settled/resolved before `run()` assigns it. This
is the only change to `resolveSlot`/`settleRedisplayTracking`'s bodies beyond clearing
`settleTimer`; neither function's signature or existing behavior otherwise changes.
