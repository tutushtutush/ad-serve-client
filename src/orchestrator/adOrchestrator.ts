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

export function createAdOrchestrator({ client, renderer }: AdOrchestratorDeps) {
  async function runSlot(element: Element): Promise<void> {
    const config = parseSlotConfig(element);
    if (!config) {
      return;
    }

    const result = await client.requestAd({
      platformId: config.platformId,
      adTypeId: config.adTypeId,
      country: config.country,
      deviceType: config.deviceType,
    });
    if (result.status !== "filled") {
      return;
    }

    // The slot may have left the page while the request was in flight
    // (navigation, dynamic removal) — discard rather than render (FR-009).
    if (!config.element.isConnected) {
      return;
    }

    renderer.renderAd(config.element, result.ad);
  }

  function run(root: ParentNode): void {
    // Deliberately not awaited in the loop: each slot's pipeline starts
    // immediately and independently, so one slot's latency or failure can
    // never delay or affect another (FR-006/FR-007).
    for (const element of discoverSlots(root)) {
      runSlot(element).catch(() => {
        // A slot that fails for any unexpected reason simply stays empty —
        // never let it escape to the host page (Constitution Principle V).
      });
    }
  }

  return { run };
}
