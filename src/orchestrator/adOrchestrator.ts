import type { AdCandidate, AdDecisionRequest, AdDecisionResult, AdSlotConfig } from "../types";

export interface AdDecisionClientLike {
  requestAd(request: AdDecisionRequest): Promise<AdDecisionResult>;
}

export interface AdRendererLike {
  renderAd(slotElement: Element, ad: AdCandidate): void;
}

export interface AdOrchestratorDeps {
  client: AdDecisionClientLike;
  renderer: AdRendererLike;
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
}

// Groups every currently-discoverable, validly-configured slot element by
// its (platformId, adTypeId, country, deviceType) tuple, in document order,
// keyed by "<groupKey>#<position within that group>". Used both to create
// Tracked Slots at discovery time and to re-resolve their current element on
// every later mutation.
function mapSlotsByGroupPosition(root: ParentNode): Map<string, Element> {
  const byPosition = new Map<string, Element>();
  const groupCounts = new Map<string, number>();

  for (const element of discoverSlots(root)) {
    const config = parseSlotConfig(element);
    if (!config) {
      continue;
    }
    const groupKey = makeGroupKey(config);
    const position = groupCounts.get(groupKey) ?? 0;
    groupCounts.set(groupKey, position + 1);
    byPosition.set(`${groupKey}#${position}`, element);
  }

  return byPosition;
}

export function createAdOrchestrator({ client, renderer }: AdOrchestratorDeps) {
  async function runSlot(slot: TrackedSlot): Promise<void> {
    try {
      const result = await client.requestAd(slot.config);
      if (result.status !== "filled") {
        slot.resolved = true;
        return;
      }

      // Read at resolution time, not capture time: currentElement may have
      // been reassigned any number of times while this request was in
      // flight (FR-003). isConnected is a final safety net against a
      // last-instant removal the observer hasn't reacted to yet.
      if (!slot.currentElement || !slot.currentElement.isConnected) {
        slot.resolved = true;
        return;
      }

      slot.ad = result.ad;
      renderer.renderAd(slot.currentElement, result.ad);
      slot.renderedElement = slot.currentElement;
      // Deliberately not resolved yet: the render may itself be undone
      // shortly afterward by the host page's own redraw (e.g. a hydration
      // mismatch discarding the subtree it landed in) — the mutation
      // observer watches renderedElement and redisplays if needed, up to
      // a bounded number of attempts, before finally settling (FR-009/010).
    } catch {
      // A slot that fails for any unexpected reason simply stays empty —
      // never let it escape to the host page (Constitution Principle V).
      slot.resolved = true;
    }
  }

  function run(root: Node & ParentNode): void {
    const trackedSlots: TrackedSlot[] = [];
    const groupCounts = new Map<string, number>();

    for (const element of discoverSlots(root)) {
      const config = parseSlotConfig(element);
      if (!config) {
        continue; // invalid config: never tracked, never requested (FR-005, feature 001)
      }
      const requestConfig: AdDecisionRequest = {
        platformId: config.platformId,
        adTypeId: config.adTypeId,
        country: config.country,
        deviceType: config.deviceType,
      };
      const groupKey = makeGroupKey(requestConfig);
      const groupPosition = groupCounts.get(groupKey) ?? 0;
      groupCounts.set(groupKey, groupPosition + 1);
      trackedSlots.push({
        config: requestConfig,
        groupKey,
        groupPosition,
        currentElement: element,
        resolved: false,
        ad: null,
        renderedElement: null,
        redisplaysRemaining: INITIAL_REDISPLAYS_REMAINING,
        quietBatchesRemaining: INITIAL_QUIET_BATCHES_REMAINING,
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

          // Rendered, watching for FR-009 (removal) or settling (FR-008).
          if (slot.renderedElement.isConnected) {
            slot.quietBatchesRemaining -= 1;
            if (slot.quietBatchesRemaining <= 0) {
              slot.resolved = true;
            }
            continue;
          }

          const current = currentByPosition.get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
          slot.currentElement = current;
          if (!current || slot.redisplaysRemaining <= 0) {
            // Genuinely gone, or the redisplay budget is exhausted — leave
            // the slot in whatever state it last reached (FR-010).
            slot.resolved = true;
            continue;
          }

          // Redisplay the same, already-fetched ad — never a second request
          // (research.md).
          renderer.renderAd(current, slot.ad as AdCandidate);
          slot.renderedElement = current;
          slot.redisplaysRemaining -= 1;
          slot.quietBatchesRemaining = INITIAL_QUIET_BATCHES_REMAINING;
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
