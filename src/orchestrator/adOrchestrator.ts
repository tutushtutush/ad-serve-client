import { asSafeString } from "../utils/asSafeString";
import type { ViewabilityDetectorLike } from "../utils/viewabilityDetector";
import type {
  AdCandidate,
  AdDecisionRequest,
  AdDecisionResult,
  AdSlotConfig,
  PlacementIdentity,
} from "../types";

// Re-exported so consumers of this module (index.ts, tests) don't need to know it actually lives
// in viewabilityDetector.ts — caught in review of #8: this used to be redeclared here as its own,
// independently-maintained interface structurally identical to the real one, which meant every
// signature change (like onGiveUp) had to be hand-edited in both places with nothing catching a
// future drift between them.
export type { ViewabilityDetectorLike };

export interface AdDecisionClientLike {
  requestAd(request: AdDecisionRequest): Promise<AdDecisionResult>;
}

export interface AdRendererLike {
  renderAd(slotElement: Element, ad: AdCandidate, placement: PlacementIdentity): void;
}

export interface ViewableImpressionClientLike {
  reportViewableImpression(report: { platformId: string; adTypeId: string; adConfigId: string }): void;
}

export interface AdOrchestratorDeps {
  client: AdDecisionClientLike;
  renderer: AdRendererLike;
  // Optional (data-model.md, feature 005): an orchestrator built without either simply never
  // starts a viewability watch, the same degrade-safely posture as a missing adConfigId — so
  // every pre-existing test of unrelated behavior doesn't also need viewability fakes. Real usage
  // (index.ts) always supplies both.
  viewabilityDetector?: ViewabilityDetectorLike;
  trackingClient?: ViewableImpressionClientLike;
}

const SLOT_SELECTOR = "[data-ad-serve-slot]";

/**
 * Reads a slot element's data-* attributes into an AdSlotConfig. Returns
 * null when required fields are missing — an invalid slot per FR-005, which
 * must never reach the Client.
 */
export function parseSlotConfig(element: Element): AdSlotConfig | null {
  const platformId = element.getAttribute("data-platform-id");
  const adTypeId = element.getAttribute("data-ad-type-id");
  if (!platformId || !adTypeId) {
    return null;
  }

  const config: AdSlotConfig = { platformId, adTypeId, element };
  const country = element.getAttribute("data-country");
  if (country) {
    config.country = country;
  }
  const deviceType = element.getAttribute("data-device-type");
  if (deviceType) {
    config.deviceType = deviceType;
  }
  return config;
}

export function discoverSlots(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(SLOT_SELECTOR));
}

// A Tracked Slot's identity survives its element being replaced (e.g. a host
// page's own framework re-rendering shortly after load). Since a replacement
// DOM node has no identity linking it back to the original, position within
// a group of same-configuration elements — in document order — is the one
// signal that does survive a like-for-like replacement (research.md).
function makeGroupKey(config: AdDecisionRequest): string {
  return JSON.stringify([config.platformId, config.adTypeId, config.country ?? null, config.deviceType ?? null]);
}

// How many times a slot's ad may be (re)displayed after the first successful
// render if it keeps getting removed (FR-010), and how many consecutive
// mutation batches it must survive, once (re)displayed, before it's
// considered settled and watching stops (FR-008). Both are bounded by
// discrete events, not wall-clock time (research.md).
const INITIAL_REDISPLAYS_REMAINING = 3;
const INITIAL_QUIET_BATCHES_REMAINING = 10;

// Caught in review (ad-serve-client#9): quietBatchesRemaining above only ever decrements when a
// mutation batch actually fires. A page that mutates once (the initial render itself) and never
// again leaves it permanently one batch short of settling, so a slot's redisplay tracking — and
// the top-level MutationObserver/trackedSlots array this file retains until every slot settles —
// never releases, for the rest of the page's life. This wall-clock fallback (feature 006) bounds
// that: past this point since a slot's most recent (re)display, its redisplay tracking settles
// anyway, the same outcome the quiet-batch path already produces. Sized like
// viewabilityDetector.ts's MAX_WATCH_DURATION_MS (feature/#8), the established precedent for this
// exact style of "bound a watch that might otherwise never conclude" fix in this codebase.
export const REDISPLAY_SETTLE_TIMEOUT_MS = 2 * 60 * 1000;

interface TrackedSlot {
  config: AdDecisionRequest;
  groupKey: string;
  groupPosition: number;
  currentElement: Element | null;
  resolved: boolean;
  // Set once the ad decision arrives filled; remembered so a redisplay
  // (FR-009) reuses it rather than requesting again (research.md).
  ad: AdCandidate | null;
  // The specific element last rendered into — checked each mutation batch
  // for disconnection to detect the FR-009 case.
  renderedElement: Element | null;
  redisplaysRemaining: number;
  quietBatchesRemaining: number;
  // The active viewability watch's stop function, or null when none is pending (never started,
  // already fired, or already stopped). Stopped and reset to null on redisplay (a fresh watch
  // starts for the new element, FR-003) and whenever the slot is marked resolved (FR-007) —
  // see resolveSlot/startViewabilityWatch below (feature 005).
  stopViewabilityWatch: (() => void) | null;
  // True once a viewable impression has been reported for this slot's ad. A redisplay reuses the
  // same already-fetched slot.ad (FR-009, research.md) rather than requesting a new one, so this
  // flag is scoped per slot rather than per (slot, redisplay instance) — it stays valid identity
  // for the ad across every redisplay. Caught in review (eventpulse #58 / ad-serve-client #7): a
  // slot redisplayed within its budget (default 3 extra attempts) started an independent watch
  // each time with no memory of a prior report, so a single ad shown once could produce up to 4
  // duplicate viewable-impression events. Checked at the top of startViewabilityWatch so a
  // redisplay after reporting doesn't even start a new IntersectionObserver.
  viewableImpressionReported: boolean;
  // The pending wall-clock settle timer (feature 006), or null when none is pending — never
  // started, already fired, or already cleared. The same invariant discipline as
  // stopViewabilityWatch above: every place that ends a slot's tracked-for-redisplay lifetime
  // (resolveSlot, settleRedisplayTracking) MUST clear this too, and every (re)display MUST
  // restart it (see scheduleSettleTimer below).
  settleTimer: ReturnType<typeof setTimeout> | null;
}

interface GroupedSlotElement {
  element: Element;
  config: AdDecisionRequest;
  groupKey: string;
  groupPosition: number;
}

// Scans root for every validly-configured slot element, grouping them by
// their (platformId, adTypeId, country, deviceType) tuple in document
// order. The single source of truth for group-position computation — used
// both to create Tracked Slots at discovery time and to re-resolve their
// current element on every later mutation (research.md) — so the two can
// never silently diverge on how positions are assigned.
function groupDiscoveredSlots(root: ParentNode): GroupedSlotElement[] {
  const groupCounts = new Map<string, number>();
  const grouped: GroupedSlotElement[] = [];

  for (const element of discoverSlots(root)) {
    const parsed = parseSlotConfig(element);
    if (!parsed) {
      continue; // invalid config: never tracked, never requested (FR-005, feature 001)
    }
    const config: AdDecisionRequest = {
      platformId: parsed.platformId,
      adTypeId: parsed.adTypeId,
      country: parsed.country,
      deviceType: parsed.deviceType,
    };
    const groupKey = makeGroupKey(config);
    const groupPosition = groupCounts.get(groupKey) ?? 0;
    groupCounts.set(groupKey, groupPosition + 1);
    grouped.push({ element, config, groupKey, groupPosition });
  }

  return grouped;
}

function mapSlotsByGroupPosition(root: ParentNode): Map<string, Element> {
  const byPosition = new Map<string, Element>();
  for (const { element, groupKey, groupPosition } of groupDiscoveredSlots(root)) {
    byPosition.set(`${groupKey}#${groupPosition}`, element);
  }
  return byPosition;
}

export function createAdOrchestrator({ client, renderer, viewabilityDetector, trackingClient }: AdOrchestratorDeps) {
  // Set once per run() call, to that call's own disconnectIfAllResolved (feature 006) — resolveSlot
  // and settleRedisplayTracking live in this outer scope, while disconnectIfAllResolved is private
  // to run()'s closure, so without this neither could ever prompt the top-level "is everything
  // done" check to re-run. That check is otherwise only invoked from specific call sites (end of
  // processMutationBatch, and runSlot(...).finally(...)) — never automatically just because a slot
  // becomes resolved. Caught in review while planning feature 006: without this, a slot settled by
  // the new wall-clock fallback on an otherwise-quiet page would mark itself resolved internally
  // but never actually release the top-level MutationObserver/trackedSlots array — the exact
  // resource this feature exists to bound. Assumes run() is called at most once per orchestrator
  // instance (matches index.ts's actual usage); a future caller invoking run() more than once with
  // overlapping in-flight slots would need this reworked, since this reference only ever points at
  // the most recently started run() call.
  let notifySlotSettled: (() => void) | null = null;

  // Wrapped, not called directly — caught in review of #10: unlike every other schedule-driven
  // entry point in this file, a bare `notifySlotSettled?.()` had no guard of its own. If
  // `disconnectIfAllResolved()` itself ever threw (a hostile/patched host-page global, a broken
  // MutationObserver polyfill), the throw would propagate out of resolveSlot()/
  // settleRedisplayTracking() — including out of runSlot()'s own catch block, which calls
  // resolveSlot() again on failure, risking an unhandled rejection on runSlot(...).finally(...)
  // reaching the host page (Constitution Principle V).
  function safeNotifySlotSettled(): void {
    try {
      notifySlotSettled?.();
    } catch {
      // See comment above.
    }
  }

  // Marks a slot resolved and stops any viewability watch still pending for it — used only where
  // the rendered instance is genuinely gone for good (never rendered, a decision failure, or
  // removed with no redisplay budget left to bring it back) and so could never become viewable
  // (FR-007).
  function resolveSlot(slot: TrackedSlot): void {
    slot.resolved = true;
    slot.stopViewabilityWatch?.();
    slot.stopViewabilityWatch = null;
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
      slot.settleTimer = null;
    }
    safeNotifySlotSettled();
  }

  // Stops only the redisplay/mutation-tracking bookkeeping for a slot whose rendered element is
  // still connected and still on the page — deliberately does NOT touch stopViewabilityWatch.
  // Caught in code review: the FR-008 "quiet batches" settle counter bounds how long to keep
  // re-checking for *redisplay churn* (a proxy for "has the host page's own hydration/redraw
  // settled down"), which is an unrelated question from "will the user ever scroll to this ad" —
  // any unrelated DOM activity elsewhere in the observed subtree (a chat widget, a live ticker)
  // can produce 10 mutation batches in seconds, long before a viewer scrolls to a slot below the
  // fold. Routing that case through resolveSlot() would silently stop watching a still-visible-
  // to-come ad, undercounting real viewable impressions — directly against this feature's core
  // accuracy guarantee (SC-002). The element being still connected is exactly the signal that
  // it remains eligible indefinitely; only genuine removal (handled by resolveSlot() elsewhere in
  // this function) ends eligibility.
  function settleRedisplayTracking(slot: TrackedSlot): void {
    slot.resolved = true;
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
      slot.settleTimer = null;
    }
    safeNotifySlotSettled();
  }

  // Restarts slot's wall-clock settle fallback (feature 006) — called every time it's (re)rendered,
  // the same two moments quietBatchesRemaining is reset. If REDISPLAY_SETTLE_TIMEOUT_MS elapses
  // with no mutation batch having settled or resolved the slot first, settles it via the exact same
  // settleRedisplayTracking() the quiet-batch path already uses, producing an identical outcome
  // (viewability watch untouched). No-ops if the slot got there some other way first, or if its
  // rendered element is no longer connected (a disconnect-triggered mutation batch is either
  // already handling this slot or about to).
  function scheduleSettleTimer(slot: TrackedSlot): void {
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
    }
    slot.settleTimer = setTimeout(() => {
      try {
        slot.settleTimer = null;
        if (slot.resolved || !slot.renderedElement || !slot.renderedElement.isConnected) {
          return;
        }
        settleRedisplayTracking(slot);
      } catch {
        // Runs on a schedule this SDK doesn't control the timing of — must never propagate to the
        // host page (Constitution Principle V), matching every other timer callback in this file.
      }
    }, REDISPLAY_SETTLE_TIMEOUT_MS);
  }

  // Starts a fresh viewability watch for a just-rendered instance of `slot`, reporting via
  // `trackingClient` once the IAB threshold (research.md) is satisfied. No-ops when either
  // dependency wasn't supplied (data-model.md) or `adConfigId` is unavailable (FR-004) — there's
  // nothing to report in either case, so no observer is started at all.
  function startViewabilityWatch(slot: TrackedSlot, element: Element): void {
    slot.stopViewabilityWatch?.();
    slot.stopViewabilityWatch = null;

    // Already reported for this slot's ad on an earlier (re)display — nothing left to watch for,
    // and starting another observer would risk yet another duplicate report (see
    // viewableImpressionReported's doc comment on TrackedSlot).
    if (slot.viewableImpressionReported) {
      return;
    }

    // adConfigId is coerced through asSafeString, same as adRenderer.ts's resolveClickHref does
    // for the identical field (feature 004) — isAdCandidate() in adDecisionClient.ts never
    // validates adConfigId's type, so a schema-drifted response (a number/object) must degrade to
    // "no report attempted", not sail through a truthy check and corrupt the report URL (caught in
    // code review; reproduced: a non-string adConfigId produced
    // "adConfigId=%5Bobject+Object%5D").
    const adConfigId = asSafeString(slot.ad?.adConfigId);
    if (!viewabilityDetector || !trackingClient || !adConfigId) {
      return;
    }

    slot.stopViewabilityWatch = viewabilityDetector.watch(element, () => {
      slot.stopViewabilityWatch = null;
      slot.viewableImpressionReported = true;
      // Wrapped here too, not just inside viewabilityDetector.ts's own callback — this closure is
      // itself an entry point invoked on a schedule this SDK doesn't control, and defense-in-depth
      // (this codebase's established pattern: never trust a single layer's contract alone) means
      // a throw from trackingClient must not propagate regardless of whether the injected
      // ViewabilityDetectorLike implementation also happens to guard its own callback invocation
      // (Constitution Principle V, FR-006).
      try {
        trackingClient.reportViewableImpression({
          platformId: slot.config.platformId,
          adTypeId: slot.config.adTypeId,
          adConfigId,
        });
      } catch {
        // See comment above.
      }
    }, () => {
      // The watch gave up on its own (MAX_WATCH_DURATION_MS elapsed, viewabilityDetector.ts) —
      // its stop() is now inert, so the documented invariant on stopViewabilityWatch ("null when
      // none is pending ... or already stopped") requires nulling it here too, not just on the
      // onViewable path above (caught in code review of #8).
      slot.stopViewabilityWatch = null;
    });
  }

  async function runSlot(slot: TrackedSlot): Promise<void> {
    try {
      const result = await client.requestAd(slot.config);
      if (result.status !== "filled") {
        resolveSlot(slot);
        return;
      }

      // Read at resolution time, not capture time: currentElement may have
      // been reassigned any number of times while this request was in
      // flight (FR-003). isConnected is a final safety net against a
      // last-instant removal the observer hasn't reacted to yet.
      if (!slot.currentElement || !slot.currentElement.isConnected) {
        resolveSlot(slot);
        return;
      }

      slot.ad = result.ad;
      renderer.renderAd(slot.currentElement, result.ad, {
        platformId: slot.config.platformId,
        adTypeId: slot.config.adTypeId,
      });
      slot.renderedElement = slot.currentElement;
      startViewabilityWatch(slot, slot.currentElement);
      scheduleSettleTimer(slot);
      // Deliberately not resolved yet: the render may itself be undone
      // shortly afterward by the host page's own redraw (e.g. a hydration
      // mismatch discarding the subtree it landed in) — the mutation
      // observer watches renderedElement and redisplays if needed, up to
      // a bounded number of attempts, before finally settling (FR-009/010).
    } catch {
      // A slot that fails for any unexpected reason simply stays empty —
      // never let it escape to the host page (Constitution Principle V).
      resolveSlot(slot);
    }
  }

  function run(root: Node & ParentNode): void {
    const trackedSlots: TrackedSlot[] = [];

    for (const { element, config, groupKey, groupPosition } of groupDiscoveredSlots(root)) {
      trackedSlots.push({
        config,
        groupKey,
        groupPosition,
        currentElement: element,
        resolved: false,
        ad: null,
        renderedElement: null,
        redisplaysRemaining: INITIAL_REDISPLAYS_REMAINING,
        quietBatchesRemaining: INITIAL_QUIET_BATCHES_REMAINING,
        stopViewabilityWatch: null,
        viewableImpressionReported: false,
        settleTimer: null,
      });
    }

    if (trackedSlots.length === 0) {
      return; // nothing to track, nothing to observe
    }

    function disconnectIfAllResolved(): void {
      if (trackedSlots.every((slot) => slot.resolved)) {
        observer.disconnect();
      }
    }

    // See notifySlotSettled's declaration above (feature 006): resolveSlot/settleRedisplayTracking
    // are defined outside this closure and otherwise have no way to prompt this exact check.
    notifySlotSettled = disconnectIfAllResolved;

    function processMutationBatch(): void {
      try {
        const currentByPosition = mapSlotsByGroupPosition(root);
        for (const slot of trackedSlots) {
          if (slot.resolved) {
            continue;
          }

          if (!slot.renderedElement) {
            // Not yet rendered: just keep currentElement pointed at whatever
            // currently occupies this slot's group position (FR-001/FR-002).
            slot.currentElement = currentByPosition.get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
            continue;
          }

          // Rendered, watching for FR-009 (removal) or settling (FR-008). The element is still
          // connected here — settleRedisplayTracking, not resolveSlot: redisplay-churn watching
          // no longer being worth it says nothing about whether the ad might still be scrolled
          // into view later (see settleRedisplayTracking's comment).
          if (slot.renderedElement.isConnected) {
            slot.quietBatchesRemaining -= 1;
            if (slot.quietBatchesRemaining <= 0) {
              settleRedisplayTracking(slot);
            }
            continue;
          }

          const current = currentByPosition.get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
          slot.currentElement = current;
          if (!current) {
            // No replacement in *this* batch doesn't mean gone for good — a
            // framework may remove and reinsert across separate mutation
            // batches rather than one coalesced swap. Keep waiting, bounded
            // by the same quiet-batch counter, rather than giving up on the
            // first empty observation (that would reintroduce the very
            // failure this feature exists to fix).
            slot.quietBatchesRemaining -= 1;
            if (slot.quietBatchesRemaining <= 0) {
              resolveSlot(slot);
            }
            continue;
          }
          if (slot.redisplaysRemaining <= 0) {
            // A current element exists, but the redisplay budget is
            // exhausted — leave the slot in whatever state it last reached
            // (FR-010).
            resolveSlot(slot);
            continue;
          }

          // Redisplay the same, already-fetched ad — never a second request
          // (research.md).
          renderer.renderAd(current, slot.ad as AdCandidate, {
            platformId: slot.config.platformId,
            adTypeId: slot.config.adTypeId,
          });
          slot.renderedElement = current;
          slot.redisplaysRemaining -= 1;
          slot.quietBatchesRemaining = INITIAL_QUIET_BATCHES_REMAINING;
          // A redisplayed instance is independently eligible to be reported again — a fresh
          // watch, not a continuation of whatever the pre-redisplay one was doing (FR-003,
          // spec Acceptance Scenario 4).
          startViewabilityWatch(slot, current);
          scheduleSettleTimer(slot);
        }
      } catch {
        // A defect here must never escape into the host page's own
        // mutation/render cycle — skip this batch, the next mutation gets
        // another chance (Constitution Principle V).
      }
      disconnectIfAllResolved();
    }

    const observer = new MutationObserver(processMutationBatch);
    observer.observe(root, { childList: true, subtree: true });

    // Deliberately not awaited in the loop: each slot's pipeline starts
    // immediately and independently, so one slot's latency or failure can
    // never delay or affect another (FR-006/FR-007, feature 001).
    for (const slot of trackedSlots) {
      runSlot(slot).finally(disconnectIfAllResolved);
    }
  }

  return { run };
}
