import {
  createAdOrchestrator,
  type AdDecisionClientLike,
  type AdRendererLike,
} from "../../../src/orchestrator/adOrchestrator";
import type { AdDecisionRequest, AdDecisionResult, BatchEntryResult, BatchSharedFields } from "../../../src/types";
import { makeAd } from "../fixtures/adCreative";

function createSlotElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  el.setAttribute("data-platform-id", "p1");
  el.setAttribute("data-ad-type-id", "leaderboard");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type BatchImpl = (requests: AdDecisionRequest[], shared: BatchSharedFields) => Promise<BatchEntryResult[] | null>;

// Each slot's batch entry carries an ad whose headline is "ad-<index>", so a test can see which entry
// reached which slot.
const distinctAds: BatchImpl = async (requests) =>
  requests.map((_, index) => ({ status: "filled", ad: makeAd({ headline: `ad-${index}` }) }));

function setup(
  slots: HTMLElement[],
  options: { batch?: BatchImpl | null; single?: (request: AdDecisionRequest) => Promise<AdDecisionResult>; viewportWidth?: number } = {},
) {
  document.body.innerHTML = "";
  document.body.append(...slots);
  const requestAd = jest.fn(
    options.single ??
      (async (_request: AdDecisionRequest): Promise<AdDecisionResult> => ({
        status: "filled",
        ad: makeAd({ headline: "single" }),
      })),
  );
  const requestAdBatch = jest.fn(options.batch ?? distinctAds);
  const client: AdDecisionClientLike =
    options.batch === null ? { requestAd } : { requestAd, requestAdBatch };
  const renderAd = jest.fn();
  const renderer: AdRendererLike = { renderAd };
  const orchestrator = createAdOrchestrator({
    client,
    renderer,
    sessionId: "session-1",
    getViewportWidth: () => options.viewportWidth ?? 1280,
  });
  const headlinesBySlot = (elements: HTMLElement[]) =>
    elements.map((element) => {
      const call = renderAd.mock.calls.find(([target]) => target === element);
      return call ? (call[1] as { creative: { headline?: string } }).creative.headline : undefined;
    });
  return { requestAd, requestAdBatch, renderAd, orchestrator, headlinesBySlot };
}

describe("batched ad requests (012)", () => {
  describe("slots on one page get different ads (US1)", () => {
    it("requests three same-category slots in one batch with the shared fields and no single requests", async () => {
      const slots = [createSlotElement(), createSlotElement(), createSlotElement()].map((el) => {
        el.setAttribute("data-category", "comedy");
        el.setAttribute("data-country", "US");
        el.setAttribute("data-device-type", "mobile");
        return el;
      });
      const { orchestrator, requestAd, requestAdBatch } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      const [requests, shared] = requestAdBatch.mock.calls[0];
      expect(requests).toHaveLength(3);
      expect(requests.map((request) => request.adTypeId)).toEqual(["leaderboard", "leaderboard", "leaderboard"]);
      expect(shared).toEqual({
        country: "US",
        deviceType: "mobile",
        category: "comedy",
        sessionId: "session-1",
      });
      expect(requestAd).not.toHaveBeenCalled();
    });

    it("renders each slot with its own entry's ad", async () => {
      const slots = [createSlotElement(), createSlotElement(), createSlotElement()];
      const { orchestrator, headlinesBySlot } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(headlinesBySlot(slots)).toEqual(["ad-0", "ad-1", "ad-2"]);
    });

    it("leaves a no-ad slot empty without a single request, and still fills the others", async () => {
      const slots = [createSlotElement(), createSlotElement()];
      const { orchestrator, requestAd, headlinesBySlot } = setup(slots, {
        batch: async () => [{ status: "empty" }, { status: "filled", ad: makeAd({ headline: "kept" }) }],
      });

      orchestrator.run(document);
      await flush();

      expect(headlinesBySlot(slots)).toEqual([undefined, "kept"]);
      expect(requestAd).not.toHaveBeenCalled();
    });

    it("uses a single request for a lone slot", async () => {
      const slots = [createSlotElement()];
      const { orchestrator, requestAd, requestAdBatch, headlinesBySlot } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).not.toHaveBeenCalled();
      expect(requestAd).toHaveBeenCalledTimes(1);
      expect(headlinesBySlot(slots)).toEqual(["single"]);
    });
  });

  describe("different details batch separately (US2)", () => {
    const withCategory = (category: string) => createSlotElement({ "data-category": category });

    it("sends slots in different categories as one batch, each placement carrying its own category (013)", async () => {
      const slots = [withCategory("music"), withCategory("comedy"), withCategory("sports")];
      const { orchestrator, requestAdBatch, requestAd, headlinesBySlot } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      const [requests, shared] = requestAdBatch.mock.calls[0];
      expect(requests.map((request) => request.category)).toEqual(["music", "comedy", "sports"]);
      expect(shared.category).toBeUndefined();
      expect(requestAd).not.toHaveBeenCalled();
      expect(headlinesBySlot(slots)).toEqual(["ad-0", "ad-1", "ad-2"]);
    });

    it("sends the shared category for the whole request only when every placement has it (013)", async () => {
      const slots = [withCategory("music"), withCategory("music")];
      const { orchestrator, requestAdBatch } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch.mock.calls[0][1].category).toBe("music");
      expect(requestAdBatch.mock.calls[0][0].map((request) => request.category)).toEqual(["music", "music"]);
    });

    it("resolves each placement's category as a single request would, mixing own, page and none (013)", async () => {
      const slots = [withCategory("music"), createSlotElement(), createSlotElement({ "data-category": "  " })];
      const { orchestrator, requestAdBatch } = setup(slots);

      orchestrator.setContext({ categories: ["sports"] });
      orchestrator.run(document);
      await flush();

      expect(requestAdBatch.mock.calls[0][0].map((request) => request.category)).toEqual([
        "music",
        "sports",
        "sports",
      ]);
      expect(requestAdBatch.mock.calls[0][1].category).toBeUndefined();
    });

    it("leaves a slot with no category at all without one, next to slots that have one (013)", async () => {
      const slots = [withCategory("music"), createSlotElement()];
      const { orchestrator, requestAdBatch } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch.mock.calls[0][0].map((request) => request.category)).toEqual(["music", undefined]);
      expect(requestAdBatch.mock.calls[0][1].category).toBeUndefined();
    });

    it("groups slots by the category they resolve to, including the page category", async () => {
      const slots = [createSlotElement(), withCategory("music"), createSlotElement()];
      const { orchestrator, requestAdBatch, requestAd } = setup(slots);

      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      expect(requestAdBatch.mock.calls[0][0]).toHaveLength(3);
      expect(requestAdBatch.mock.calls[0][1].category).toBe("music");
      expect(requestAd).not.toHaveBeenCalled();
    });

    it("lets different ad types with the same category share a batch", async () => {
      const slots = [
        createSlotElement({ "data-ad-type-id": "leaderboard" }),
        createSlotElement({ "data-ad-type-id": "medium-rectangle" }),
      ];
      const { orchestrator, requestAdBatch } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      expect(requestAdBatch.mock.calls[0][0].map((request) => request.adTypeId)).toEqual([
        "leaderboard",
        "medium-rectangle",
      ]);
    });

    it("splits batches when country or device type differ", async () => {
      const slots = [
        createSlotElement({ "data-country": "US" }),
        createSlotElement({ "data-country": "CA" }),
        createSlotElement({ "data-country": "US" }),
      ];
      const { orchestrator, requestAdBatch, requestAd } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      expect(requestAdBatch.mock.calls[0][1].country).toBe("US");
      expect(requestAd).toHaveBeenCalledTimes(1);
    });

    it("sends 50 placements in one batch and the 51st as a single request", async () => {
      const slots = Array.from({ length: 51 }, () => createSlotElement());
      const { orchestrator, requestAdBatch, requestAd } = setup(slots);

      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(1);
      expect(requestAdBatch.mock.calls[0][0]).toHaveLength(50);
      expect(requestAd).toHaveBeenCalledTimes(1);
    });
  });

  describe("a failed batch never leaves slots worse off (US3)", () => {
    it.each([
      ["returns null", async () => null],
      [
        "throws",
        async () => {
          throw new Error("boom");
        },
      ],
    ])("makes every slot request its own ad when the batch %s", async (_label, batch) => {
      const slots = [createSlotElement(), createSlotElement(), createSlotElement()];
      const { orchestrator, requestAd, headlinesBySlot } = setup(slots, { batch: batch as BatchImpl });

      expect(() => orchestrator.run(document)).not.toThrow();
      await flush();

      expect(requestAd).toHaveBeenCalledTimes(3);
      expect(headlinesBySlot(slots)).toEqual(["single", "single", "single"]);
    });

    it("falls back each slot of a mixed-category batch with its own category (013)", async () => {
      const slots = [createSlotElement({ "data-category": "music" }), createSlotElement({ "data-category": "comedy" })];
      const { orchestrator, requestAd } = setup(slots, { batch: async () => null });

      orchestrator.run(document);
      await flush();

      expect(requestAd.mock.calls.map(([request]) => request.category).sort()).toEqual(["comedy", "music"]);
    });

    it("falls back only the failed entry, keeping the others' batch results", async () => {
      const slots = [createSlotElement(), createSlotElement(), createSlotElement()];
      const { orchestrator, requestAd, headlinesBySlot } = setup(slots, {
        batch: async () => [
          { status: "filled", ad: makeAd({ headline: "batch-0" }) },
          { status: "failed" },
          { status: "filled", ad: makeAd({ headline: "batch-2" }) },
        ],
      });

      orchestrator.run(document);
      await flush();

      expect(requestAd).toHaveBeenCalledTimes(1);
      expect(headlinesBySlot(slots)).toEqual(["batch-0", "single", "batch-2"]);
    });

    it("leaves a slot empty, not pending, when its fallback finds no ad", async () => {
      const slots = [createSlotElement(), createSlotElement()];
      const { orchestrator, headlinesBySlot } = setup(slots, {
        batch: async () => null,
        single: async () => ({ status: "empty" }),
      });

      orchestrator.run(document);
      await flush();

      expect(headlinesBySlot(slots)).toEqual([undefined, undefined]);
    });
  });

  describe("everything else keeps working (US4)", () => {
    it("never requests a claimed slot again and batches new slots separately on a later run", async () => {
      const first = [createSlotElement(), createSlotElement()];
      const { orchestrator, requestAdBatch } = setup(first);
      orchestrator.run(document);
      await flush();

      const added = [createSlotElement(), createSlotElement()];
      document.body.append(...added);
      orchestrator.run(document);
      await flush();

      expect(requestAdBatch).toHaveBeenCalledTimes(2);
      expect(requestAdBatch.mock.calls.map(([requests]) => requests.length)).toEqual([2, 2]);
    });

    it("drops a result for a slot removed while the batch was in flight", async () => {
      // Different platform ids so the two slots are separate groups for the SDK's own re-matching of
      // removed elements by position, while still sharing one batch.
      const slots = [createSlotElement({ "data-platform-id": "p-a" }), createSlotElement({ "data-platform-id": "p-b" })];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { orchestrator, renderAd } = setup(slots, {
        batch: async (requests) => {
          await gate;
          return distinctAds(requests, {});
        },
      });

      orchestrator.run(document);
      slots[0].remove();
      release();
      await flush();

      expect(renderAd).toHaveBeenCalledTimes(1);
      expect(renderAd.mock.calls[0][0]).toBe(slots[1]);
    });

    it("puts each slot's width-chosen ad type in its placement", async () => {
      const slots = [
        createSlotElement({ "data-ad-type-id": "", "data-ad-types": "0:large-mobile-banner,768:leaderboard" }),
        createSlotElement({ "data-ad-type-id": "", "data-ad-types": "0:large-mobile-banner,768:leaderboard" }),
      ];
      const phone = setup(slots, { viewportWidth: 390 });
      phone.orchestrator.run(document);
      await flush();
      const desktop = setup(
        [
          createSlotElement({ "data-ad-type-id": "", "data-ad-types": "0:large-mobile-banner,768:leaderboard" }),
          createSlotElement({ "data-ad-type-id": "", "data-ad-types": "0:large-mobile-banner,768:leaderboard" }),
        ],
        { viewportWidth: 1280 },
      );
      desktop.orchestrator.run(document);
      await flush();

      expect(phone.requestAdBatch.mock.calls[0][0].map((request) => request.adTypeId)).toEqual([
        "large-mobile-banner",
        "large-mobile-banner",
      ]);
      expect(desktop.requestAdBatch.mock.calls[0][0].map((request) => request.adTypeId)).toEqual([
        "leaderboard",
        "leaderboard",
      ]);
    });

    it("keeps using single requests for a client without a batch method", async () => {
      const slots = [createSlotElement(), createSlotElement()];
      const { orchestrator, requestAd, headlinesBySlot } = setup(slots, { batch: null });

      orchestrator.run(document);
      await flush();

      expect(requestAd).toHaveBeenCalledTimes(2);
      expect(headlinesBySlot(slots)).toEqual(["single", "single"]);
    });
  });
});
