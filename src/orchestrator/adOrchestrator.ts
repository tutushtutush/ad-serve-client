import { asSafeString } from "../utils/asSafeString";
import type {
  AdCandidate,
  AdDecisionRequest,
  AdDecisionResult,
  AdSlotConfig,
  PlacementIdentity,
} from "../types";

export interface AdDecisionClientLike {
  requestAd(request: AdDecisionRequest): Promise<AdDecisionResult>;
}

export interface AdRendererLike {
  renderAd(slotElement: Element, ad: AdCandidate, placement: PlacementIdentity): void;
}

export interface ViewabilityDetectorLike {
  watch(element: Element, onViewable: () => void): () => void;
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
  // Marks a slot resolved and stops any viewability watch still pending for it — used only where
  // the rendered instance is genuinely gone for good (never rendered, a decision failure, or
  // removed with no redisplay budget left to bring it back) and so could never become viewable
  // (FR-007).
  function resolveSlot(slot: TrackedSlot): void {
    slot.resolved = true;
    slot.stopViewabilityWatch?.();
    slot.stopViewabilityWatch = null;
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
