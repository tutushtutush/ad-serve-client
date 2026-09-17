import {
  createAdOrchestrator,
  discoverSlots,
  parseSlotConfig,
  type AdDecisionClientLike,
  type AdRendererLike,
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
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

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

    expect(renderer.renderAd).toHaveBeenCalledWith(el, ad);
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
    expect(renderer.renderAd).toHaveBeenCalledWith(fastSlot, ad);
  });
});
