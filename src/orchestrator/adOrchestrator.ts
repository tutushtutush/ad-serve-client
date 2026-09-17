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

interface TrackedSlot {
  config: AdDecisionRequest;
  groupKey: string;
  groupPosition: number;
  currentElement: Element | null;
  resolved: boolean;
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
        return;
      }

      // Read at resolution time, not capture time: currentElement may have
      // been reassigned any number of times while this request was in
      // flight (FR-003). isConnected is a final safety net against a
      // last-instant removal the observer hasn't reacted to yet.
      if (!slot.currentElement || !slot.currentElement.isConnected) {
        return;
      }

      renderer.renderAd(slot.currentElement, result.ad);
    } finally {
      // Once an outcome is determined, this slot is done — no further
      // mutation observation affects it (FR-008).
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
      });
    }

    if (trackedSlots.length === 0) {
      return; // nothing to track, nothing to observe
    }

    function remapCurrentElements(): void {
      try {
        const currentByPosition = mapSlotsByGroupPosition(root);
        for (const slot of trackedSlots) {
          if (slot.resolved) {
            continue;
          }
          slot.currentElement = currentByPosition.get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
        }
      } catch {
        // A defect here must never escape into the host page's own
        // mutation/render cycle — skip this batch, the next mutation gets
        // another chance (Constitution Principle V).
      }
    }

    const observer = new MutationObserver(remapCurrentElements);
    observer.observe(root, { childList: true, subtree: true });

    function disconnectIfAllResolved(): void {
      if (trackedSlots.every((slot) => slot.resolved)) {
        observer.disconnect();
      }
    }

    // Deliberately not awaited in the loop: each slot's pipeline starts
    // immediately and independently, so one slot's latency or failure can
    // never delay or affect another (FR-006/FR-007, feature 001).
    for (const slot of trackedSlots) {
      runSlot(slot)
        .catch(() => {
          // A slot that fails for any unexpected reason simply stays empty
          // — never let it escape to the host page (Constitution Principle V).
        })
        .finally(disconnectIfAllResolved);
    }
  }

  return { run };
}
