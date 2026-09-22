import {
  createAdOrchestrator,
  discoverSlots,
  parseSlotConfig,
  type AdDecisionClientLike,
  type AdRendererLike,
  type ViewabilityDetectorLike,
  type ViewableImpressionClientLike,
} from "../../../src/orchestrator/adOrchestrator";
import type { AdDecisionResult } from "../../../src/types";
import { makeAd } from "../fixtures/adCreative";

function createSlotElement(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Waits a full macrotask tick — longer than any microtask/MutationObserver
// delivery, so it reliably observes effects of a DOM mutation made just
// before calling this.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const ad = makeAd();

describe("parseSlotConfig", () => {
  it("returns a config for a slot with required fields", () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });

    expect(parseSlotConfig(el)).toEqual({ platformId: "p1", adTypeId: "banner", element: el });
  });

  it("includes optional country/deviceType when present", () => {
    const el = createSlotElement({
      "data-platform-id": "p1",
      "data-ad-type-id": "banner",
      "data-country": "US",
      "data-device-type": "desktop",
    });

    expect(parseSlotConfig(el)).toEqual({
      platformId: "p1",
      adTypeId: "banner",
      country: "US",
      deviceType: "desktop",
      element: el,
    });
  });

  it("returns null when data-platform-id is missing", () => {
    const el = createSlotElement({ "data-ad-type-id": "banner" });

    expect(parseSlotConfig(el)).toBeNull();
  });

  it("returns null when data-ad-type-id is missing", () => {
    const el = createSlotElement({ "data-platform-id": "p1" });

    expect(parseSlotConfig(el)).toBeNull();
  });
});

describe("discoverSlots", () => {
  it("finds only elements marked data-ad-serve-slot", () => {
    document.body.innerHTML = "";
    const slot = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    const other = document.createElement("div");
    document.body.append(slot, other);

    expect(discoverSlots(document)).toEqual([slot]);
  });
});

describe("createAdOrchestrator.run", () => {
  it("renders the ad when a valid slot resolves filled", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await new Promise(process.nextTick);

    expect(renderer.renderAd).toHaveBeenCalledWith(el, ad, { platformId: "p1", adTypeId: "banner" });
  });

  it("never calls the client for an invalid slot", async () => {
    const el = createSlotElement({ "data-platform-id": "p1" }); // missing adTypeId
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = { requestAd: jest.fn() };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await new Promise(process.nextTick);

    expect(client.requestAd).not.toHaveBeenCalled();
    expect(renderer.renderAd).not.toHaveBeenCalled();
  });

  it("never calls the renderer when the result is empty", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "empty" })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await new Promise(process.nextTick);

    expect(renderer.renderAd).not.toHaveBeenCalled();
  });

  it("discards a filled result if the slot element left the page before it arrived", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const { promise, resolve } = deferred<AdDecisionResult>();
    const client: AdDecisionClientLike = { requestAd: jest.fn(() => promise) };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    el.remove();
    resolve({ status: "filled", ad });
    await new Promise(process.nextTick);

    expect(renderer.renderAd).not.toHaveBeenCalled();
  });

  it("resolves each slot independently — a hung slot never blocks another", async () => {
    const hungSlot = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    const fastSlot = createSlotElement({ "data-platform-id": "p2", "data-ad-type-id": "leaderboard" });
    document.body.innerHTML = "";
    document.body.append(hungSlot, fastSlot);

    const neverResolves = new Promise<AdDecisionResult>(() => {});
    const client: AdDecisionClientLike = {
      requestAd: jest.fn((request) =>
        request.platformId === "p1" ? neverResolves : Promise.resolve({ status: "filled", ad }),
      ),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await new Promise(process.nextTick);

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    expect(renderer.renderAd).toHaveBeenCalledWith(fastSlot, ad, {
      platformId: "p2",
      adTypeId: "leaderboard",
    });
  });

  // --- 002-resilient-slot-discovery ---

  it("renders into the replacement element when the original is swapped out before the ad resolves", async () => {
    const original = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(original);

    const { promise, resolve } = deferred<AdDecisionResult>();
    const client: AdDecisionClientLike = { requestAd: jest.fn(() => promise) };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);

    const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    original.replaceWith(replacement);
    await flushMicrotasks();

    resolve({ status: "filled", ad });
    await flushMicrotasks();

    expect(client.requestAd).toHaveBeenCalledTimes(1); // no second request for the replacement
    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    // toBe, not toHaveBeenCalledWith: original/replacement are structurally
    // identical elements (same tag/attributes), so a deep-equality matcher
    // can't tell them apart — only reference identity proves which one was
    // actually used.
    const [renderedElement] = (renderer.renderAd as jest.Mock).mock.calls[0];
    expect(renderedElement).toBe(replacement);
    expect(renderedElement).not.toBe(original);
  });

  it("renders exactly one ad even if the slot's element is replaced twice before resolution", async () => {
    const first = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(first);

    const { promise, resolve } = deferred<AdDecisionResult>();
    const client: AdDecisionClientLike = { requestAd: jest.fn(() => promise) };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);

    const second = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    first.replaceWith(second);
    await flushMicrotasks();

    const third = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    second.replaceWith(third);
    await flushMicrotasks();

    resolve({ status: "filled", ad });
    await flushMicrotasks();

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    const [renderedElement] = (renderer.renderAd as jest.Mock).mock.calls[0];
    expect(renderedElement).toBe(third); // reference check — see note above
    expect(renderedElement).not.toBe(first);
    expect(renderedElement).not.toBe(second);
  });

  it("resolves empty with no render when the slot is removed for good, even after the observer has processed the removal", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const { promise, resolve } = deferred<AdDecisionResult>();
    const client: AdDecisionClientLike = { requestAd: jest.fn(() => promise) };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);

    el.remove();
    await flushMicrotasks(); // observer processes the removal, currentElement -> null

    resolve({ status: "filled", ad });
    await flushMicrotasks();

    expect(renderer.renderAd).not.toHaveBeenCalled();
  });

  it("keeps two identically-configured slots correctly distinguished when only one is replaced", async () => {
    const slotA = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    const slotB = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(slotA, slotB);

    const deferredA = deferred<AdDecisionResult>();
    const deferredB = deferred<AdDecisionResult>();
    let requestCallCount = 0;
    const client: AdDecisionClientLike = {
      requestAd: jest.fn(() => (requestCallCount++ === 0 ? deferredA.promise : deferredB.promise)),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document); // discovery order: slotA is group position 0, slotB is position 1

    const replacementB = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    slotB.replaceWith(replacementB);
    await flushMicrotasks();

    const adA = makeAd({ headline: "Ad A" });
    const adB = makeAd({ headline: "Ad B" });
    deferredA.resolve({ status: "filled", ad: adA });
    deferredB.resolve({ status: "filled", ad: adB });
    await flushMicrotasks();

    // toBe, not toHaveBeenCalledWith: all four slot elements are
    // structurally identical (same tag/attributes) — only reference
    // identity proves slot A's and slot B's results never got crossed.
    expect(renderer.renderAd).toHaveBeenCalledTimes(2);
    const calls = (renderer.renderAd as jest.Mock).mock.calls;
    const callForA = calls.find(([, calledAd]) => calledAd === adA);
    const callForB = calls.find(([, calledAd]) => calledAd === adB);
    expect(callForA?.[0]).toBe(slotA);
    expect(callForB?.[0]).toBe(replacementB);
    expect(callForB?.[0]).not.toBe(slotB);
  });

  it("does not reprocess a slot after it has resolved, even if the page mutates again", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks();

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);

    // Unrelated mutation after resolution — must not trigger a second request/render.
    document.body.append(document.createElement("div"));
    await flushMicrotasks();

    expect(client.requestAd).toHaveBeenCalledTimes(1);
    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
  });

  it("recovers after a defect during mutation remapping — a later, unaffected mutation is still processed", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const { promise, resolve } = deferred<AdDecisionResult>();
    const client: AdDecisionClientLike = { requestAd: jest.fn(() => promise) };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);

    const querySpy = jest
      .spyOn(Document.prototype, "querySelectorAll")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });

    document.body.append(document.createElement("div")); // triggers a remap attempt that throws
    await flushMicrotasks();

    querySpy.mockRestore();

    const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    el.replaceWith(replacement); // a later, unaffected mutation
    await flushMicrotasks();

    resolve({ status: "filled", ad });
    await flushMicrotasks();

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    const [renderedElement] = (renderer.renderAd as jest.Mock).mock.calls[0];
    expect(renderedElement).toBe(replacement); // reference check — see note above
    expect(renderedElement).not.toBe(el);
  });

  // --- 002-resilient-slot-discovery amendment: post-render redisplay ---

  it("redisplays the same ad when the rendered element is removed and replaced (FR-009)", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks(); // initial render

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    const [firstRenderedElement] = (renderer.renderAd as jest.Mock).mock.calls[0];

    // Simulate hydration's mismatch-recovery: the element we rendered into
    // is discarded and replaced with a fresh one bearing the same config.
    const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    (firstRenderedElement as Element).replaceWith(replacement);
    await flushMicrotasks();

    expect(client.requestAd).toHaveBeenCalledTimes(1); // no second request
    expect(renderer.renderAd).toHaveBeenCalledTimes(2);
    const [secondRenderedElement, secondAd] = (renderer.renderAd as jest.Mock).mock.calls[1];
    expect(secondRenderedElement).toBe(replacement);
    expect(secondAd).toBe(ad); // same ad object — reused, not re-fetched
  });

  it("passes the same, correct placement identity to renderAd on both the initial render and a redisplay (feature 004, US1 Scenario 2)", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks();
    const [, , firstPlacement] = (renderer.renderAd as jest.Mock).mock.calls[0];

    const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    el.replaceWith(replacement);
    await flushMicrotasks();
    const [, , secondPlacement] = (renderer.renderAd as jest.Mock).mock.calls[1];

    const expected = { platformId: "p1", adTypeId: "banner" };
    expect(firstPlacement).toEqual(expected);
    expect(secondPlacement).toEqual(expected);
  });

  it("stops redisplaying after a bounded number of attempts, even under continuous removal (FR-010)", async () => {
    let current = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(current);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks(); // initial render (attempt 1)

    // Keep replacing the rendered element well beyond any reasonable budget.
    const replacements = 10;
    for (let i = 0; i < replacements; i++) {
      const next = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      current.replaceWith(next);
      current = next;
      await flushMicrotasks();
    }

    expect(client.requestAd).toHaveBeenCalledTimes(1); // still only ever one request
    // Exactly one initial render plus a small, bounded number of redisplays
    // — not one render per replacement (which would mean no bound at all).
    const totalRenders = (renderer.renderAd as jest.Mock).mock.calls.length;
    expect(totalRenders).toBeGreaterThan(1);
    expect(totalRenders).toBeLessThan(replacements);

    // Further replacement after the budget is exhausted must not add more.
    const afterBudget = totalRenders;
    const next = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    current.replaceWith(next);
    await flushMicrotasks();
    expect(renderer.renderAd).toHaveBeenCalledTimes(afterBudget);
  });

  it("settles after surviving enough consecutive quiet mutations, and a later removal has no further effect (FR-008)", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks(); // initial render

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);

    // Several unrelated, "quiet" mutation batches — the rendered element
    // stays connected throughout, so the slot eventually settles. Comfortably
    // more than the settle bound so the slot is definitely settled before
    // the removal below (not incidentally passing because it's still mid-watch).
    for (let i = 0; i < 15; i++) {
      document.body.append(document.createElement("span"));
      await flushMicrotasks();
    }

    // Now that it should have settled, removing the rendered element must
    // NOT trigger a redisplay — watching has already stopped (FR-008).
    el.remove();
    await flushMicrotasks();

    expect(renderer.renderAd).toHaveBeenCalledTimes(1);
  });

  it("still redisplays when the replacement arrives in a later mutation batch, not the same one as the removal", async () => {
    const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.innerHTML = "";
    document.body.append(el);

    const client: AdDecisionClientLike = {
      requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })),
    };
    const renderer: AdRendererLike = { renderAd: jest.fn() };
    const orchestrator = createAdOrchestrator({ client, renderer });

    orchestrator.run(document);
    await flushMicrotasks(); // initial render
    expect(renderer.renderAd).toHaveBeenCalledTimes(1);

    // Removal with no replacement in this batch — a framework may remove
    // and reinsert across separate ticks rather than one coalesced swap.
    el.remove();
    await flushMicrotasks();
    expect(renderer.renderAd).toHaveBeenCalledTimes(1); // no redisplay yet, but not given up either

    // The replacement arrives in a distinctly later batch.
    const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
    document.body.append(replacement);
    await flushMicrotasks();

    expect(client.requestAd).toHaveBeenCalledTimes(1); // still no second request
    expect(renderer.renderAd).toHaveBeenCalledTimes(2);
    const [renderedElement] = (renderer.renderAd as jest.Mock).mock.calls[1];
    expect(renderedElement).toBe(replacement);
  });

  // --- 005-wire-viewable-impression ---

  const adWithConfig = { ...makeAd(), adConfigId: "config-1" };

  function createFakeViewabilityDetector() {
    const watchCalls: Array<{
      element: Element;
      onViewable: () => void;
      onGiveUp?: () => void;
      stop: jest.Mock;
    }> = [];
    const detector: ViewabilityDetectorLike = {
      watch: jest.fn((element: Element, onViewable: () => void, onGiveUp?: () => void) => {
        const stop = jest.fn();
        watchCalls.push({ element, onViewable, onGiveUp, stop });
        return stop;
      }),
    };
    return { detector, watchCalls };
  }

  function createFakeTrackingClient() {
    const trackingClient: ViewableImpressionClientLike = { reportViewableImpression: jest.fn() };
    return trackingClient as ViewableImpressionClientLike & { reportViewableImpression: jest.Mock };
  }

  describe("viewability tracking", () => {
    it("starts a viewability watch on the rendered element after a successful render, when adConfigId is available", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      expect(watchCalls).toHaveLength(1);
      expect(watchCalls[0].element).toBe(el);
    });

    it("reports via trackingClient with the correct identifiers once the watch fires", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      watchCalls[0].onViewable();

      expect(trackingClient.reportViewableImpression).toHaveBeenCalledWith({
        platformId: "p1",
        adTypeId: "banner",
        adConfigId: "config-1",
      });
    });

    it("never starts a watch when adConfigId is unavailable (FR-004)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad })), // no adConfigId
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      expect(renderer.renderAd).toHaveBeenCalledTimes(1); // ad still renders
      expect(watchCalls).toHaveLength(0);
    });

    it("never reports a non-string adConfigId as-is, degrading like a missing one (caught in code review)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      // A schema-drifted response: adConfigId present but the wrong type (isAdCandidate never
      // validates its type, only that creative/width/height are present).
      const malformedAd = { ...makeAd(), adConfigId: { foo: 1 } as unknown as string };
      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: malformedAd })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      expect(renderer.renderAd).toHaveBeenCalledTimes(1); // ad still renders
      expect(watchCalls).toHaveLength(0); // no watch started for an un-reportable ad instance
    });

    it("never starts a watch, and never throws, when viewabilityDetector/trackingClient aren't provided", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const orchestrator = createAdOrchestrator({ client, renderer }); // no viewability deps

      orchestrator.run(document);
      await flushMicrotasks();

      expect(renderer.renderAd).toHaveBeenCalledTimes(1);
    });

    it("a redisplay stops the pre-redisplay watch and starts an independent new one (FR-003, spec Acceptance Scenario 4)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks(); // initial render
      expect(watchCalls).toHaveLength(1);
      const firstWatch = watchCalls[0];

      const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      el.replaceWith(replacement);
      await flushMicrotasks(); // redisplay

      expect(firstWatch.stop).toHaveBeenCalledTimes(1);
      expect(watchCalls).toHaveLength(2);
      expect(watchCalls[1].element).toBe(replacement);

      // Both watches are independently reportable.
      watchCalls[1].onViewable();
      expect(trackingClient.reportViewableImpression).toHaveBeenCalledTimes(1);
    });

    it("keeps a still-pending watch alive when a slot settles via quiet mutation batches while its element stays connected (caught in code review)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks(); // initial render
      expect(watchCalls).toHaveLength(1);

      // Enough quiet mutation batches for redisplay-tracking to settle (mirrors the FR-008 settle
      // test) — but the rendered element itself is never removed. The ad may still be below the
      // fold, not yet scrolled to: its viewability watch must not be cut short just because
      // unrelated page activity produced enough mutation batches (SC-002).
      for (let i = 0; i < 15; i++) {
        document.body.append(document.createElement("span"));
        await flushMicrotasks();
      }

      expect(watchCalls[0].stop).not.toHaveBeenCalled();

      // And it still works: scrolling it into view later (simulated here as the watch firing)
      // still produces a report.
      watchCalls[0].onViewable();
      expect(trackingClient.reportViewableImpression).toHaveBeenCalledTimes(1);
    });

    it("stops a still-pending watch once a slot's redisplay budget is exhausted after genuine removals (FR-007)", async () => {
      let current = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(current);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks(); // initial render
      expect(watchCalls).toHaveLength(1);

      // Keep genuinely replacing the rendered element well beyond the redisplay budget
      // (mirrors the FR-010 "bounded redisplays" test) — each replacement starts its own fresh
      // watch and stops the previous one; the very last one, once the budget is exhausted, is
      // never replaced by a new watch and must itself be stopped.
      for (let i = 0; i < 10; i++) {
        const next = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
        current.replaceWith(next);
        current = next;
        await flushMicrotasks();
      }

      const lastWatch = watchCalls[watchCalls.length - 1];
      expect(lastWatch.stop).toHaveBeenCalledTimes(1);
    });

    it("does not report a duplicate viewable impression across redisplays once already reported (ad-serve-client #7)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks(); // initial render
      expect(watchCalls).toHaveLength(1);

      // Reported once, before any redisplay.
      watchCalls[0].onViewable();
      expect(trackingClient.reportViewableImpression).toHaveBeenCalledTimes(1);

      // A redisplay after the report must not start a new watch at all — nothing left to report.
      const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      el.replaceWith(replacement);
      await flushMicrotasks();

      expect(renderer.renderAd).toHaveBeenCalledTimes(2); // still redisplays the ad itself
      expect(watchCalls).toHaveLength(1); // but no second watch
      expect(trackingClient.reportViewableImpression).toHaveBeenCalledTimes(1); // no duplicate report
    });

    it("clears stopViewabilityWatch once the watch gives up on its own, so a later redisplay never re-invokes its stale stop() (caught in review of #8)", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks(); // initial render
      expect(watchCalls).toHaveLength(1);

      // Simulate viewabilityDetector.ts's internal max-watch-duration timer giving up.
      watchCalls[0].onGiveUp?.();
      expect(watchCalls[0].stop).not.toHaveBeenCalled(); // give-up already self-stopped internally

      // A redisplay afterward starts an independent new watch, same as any other redisplay —
      // and must not call the first watch's now-stale stop() again.
      const replacement = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      el.replaceWith(replacement);
      await flushMicrotasks();

      expect(watchCalls).toHaveLength(2);
      expect(watchCalls[0].stop).not.toHaveBeenCalled();
    });

    it("a throwing trackingClient.reportViewableImpression does not propagate", async () => {
      const el = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      document.body.innerHTML = "";
      document.body.append(el);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const { detector, watchCalls } = createFakeViewabilityDetector();
      const trackingClient: ViewableImpressionClientLike = {
        reportViewableImpression: jest.fn(() => {
          throw new Error("boom");
        }),
      };
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      expect(() => watchCalls[0].onViewable()).not.toThrow();
    });

    it("a throwing viewabilityDetector.watch does not prevent the ad from rendering or another slot from processing", async () => {
      const throwingSlot = createSlotElement({ "data-platform-id": "p1", "data-ad-type-id": "banner" });
      const okSlot = createSlotElement({ "data-platform-id": "p2", "data-ad-type-id": "leaderboard" });
      document.body.innerHTML = "";
      document.body.append(throwingSlot, okSlot);

      const client: AdDecisionClientLike = {
        requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "filled", ad: adWithConfig })),
      };
      const renderer: AdRendererLike = { renderAd: jest.fn() };
      const detector: ViewabilityDetectorLike = {
        watch: jest.fn((element: Element) => {
          if (element === throwingSlot) {
            throw new Error("boom");
          }
          return jest.fn();
        }),
      };
      const trackingClient = createFakeTrackingClient();
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector: detector,
        trackingClient,
      });

      orchestrator.run(document);
      await flushMicrotasks();

      expect(renderer.renderAd).toHaveBeenCalledTimes(2);
    });
  });
});
