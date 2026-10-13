import {
  createAdOrchestrator,
  parseSlotConfig,
  type AdDecisionClientLike,
  type AdRendererLike,
} from "../../../src/orchestrator/adOrchestrator";
import type { AdDecisionResult } from "../../../src/types";
import { makeAd } from "../fixtures/adCreative";

function slot(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(platformId: string | undefined, slots: HTMLElement[], withWarn = true) {
  document.body.innerHTML = "";
  document.body.append(...slots);
  const requestAd = jest.fn(async () => ({ status: "filled", ad: makeAd() }) as AdDecisionResult);
  const requestAdBatch = jest.fn(async (requests: unknown[]) =>
    requests.map(() => ({ status: "filled", ad: makeAd() }) as AdDecisionResult),
  );
  const client = { requestAd, requestAdBatch } as unknown as AdDecisionClientLike;
  const renderer: AdRendererLike = { renderAd: jest.fn() };
  const warn = jest.fn();
  const orchestrator = createAdOrchestrator({ platformId, client, renderer, ...(withWarn ? { warn } : {}) });
  return { orchestrator, requestAd, requestAdBatch, renderer, warn };
}

function sentPlatformIds(calls: Array<{ mock: { calls: unknown[][] } }>): string[] {
  const ids: string[] = [];
  for (const fn of calls) {
    for (const [arg] of fn.mock.calls) {
      for (const request of Array.isArray(arg) ? arg : [arg]) {
        ids.push((request as { platformId: string }).platformId);
      }
    }
  }
  return ids;
}

describe("platform id supplied by the loader script tag (015)", () => {
  describe("serving with a platform id", () => {
    it("sends the page's platform id for single-type and responsive slots", async () => {
      const { orchestrator, requestAd, requestAdBatch } = setup("plat-1", [
        slot({ "data-ad-type-id": "banner" }),
        slot({ "data-ad-types": "0:mobile-banner,768:leaderboard" }),
      ]);

      orchestrator.run(document);
      await flush();

      const ids = sentPlatformIds([requestAd, requestAdBatch]);
      expect(ids).toHaveLength(2);
      expect(new Set(ids)).toEqual(new Set(["plat-1"]));
    });

    it("uses the same platform id for slots found by a later run() on a new root", async () => {
      const { orchestrator, requestAd, requestAdBatch } = setup("plat-1", [slot({ "data-ad-type-id": "banner" })]);
      orchestrator.run(document);
      await flush();

      const later = document.createElement("section");
      later.append(slot({ "data-ad-type-id": "leaderboard" }));
      document.body.append(later);
      orchestrator.run(later);
      await flush();

      const ids = sentPlatformIds([requestAd, requestAdBatch]);
      expect(ids).toEqual(["plat-1", "plat-1"]);
    });

    it("trims whitespace around the platform id", async () => {
      const { orchestrator, requestAd, requestAdBatch } = setup("  plat-1 ", [slot({ "data-ad-type-id": "banner" })]);

      orchestrator.run(document);
      await flush();

      expect(sentPlatformIds([requestAd, requestAdBatch])).toEqual(["plat-1"]);
    });

    it("still skips a slot with no ad type", async () => {
      const { orchestrator, requestAd, requestAdBatch, warn } = setup("plat-1", [slot({})]);

      orchestrator.run(document);
      await flush();

      expect(requestAd).not.toHaveBeenCalled();
      expect(requestAdBatch).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("missing platform id", () => {
    it.each([
      ["absent", undefined],
      ["empty", ""],
      ["blank", "   "],
    ])("warns once and serves nothing when the id is %s", async (_label, platformId) => {
      const slots = [slot({ "data-ad-type-id": "banner" }), slot({ "data-ad-type-id": "leaderboard" })];
      const { orchestrator, requestAd, requestAdBatch, renderer, warn } = setup(platformId, slots);

      orchestrator.run(document);
      orchestrator.run(document);
      orchestrator.run(slots[0]);
      await flush();

      expect(warn).toHaveBeenCalledTimes(1);
      const message = warn.mock.calls[0][0] as string;
      expect(message).toContain("Platform id missing");
      expect(message).toContain("data-platform-id");
      expect(message).toContain("<script>");
      expect(requestAd).not.toHaveBeenCalled();
      expect(requestAdBatch).not.toHaveBeenCalled();
      expect(renderer.renderAd).not.toHaveBeenCalled();
      expect(slots.every((el) => el.childElementCount === 0)).toBe(true);
    });

    it("does not throw when warn throws or is not provided", () => {
      const { orchestrator, warn } = setup(undefined, [slot({ "data-ad-type-id": "banner" })]);
      warn.mockImplementation(() => {
        throw new Error("logger broke");
      });
      expect(() => orchestrator.run(document)).not.toThrow();

      const noWarn = setup(undefined, [slot({ "data-ad-type-id": "banner" })], false);
      expect(() => noWarn.orchestrator.run(document)).not.toThrow();
    });
  });

  describe("slot-level data-platform-id is ignored", () => {
    it("uses the page's id, not the slot's", async () => {
      const { orchestrator, requestAd, requestAdBatch } = setup("A", [
        slot({ "data-ad-type-id": "banner", "data-platform-id": "B" }),
      ]);

      orchestrator.run(document);
      await flush();

      expect(sentPlatformIds([requestAd, requestAdBatch])).toEqual(["A"]);
    });

    it("is not a fallback when the page has no id", async () => {
      const { orchestrator, requestAd, requestAdBatch, warn } = setup(undefined, [
        slot({ "data-ad-type-id": "banner", "data-platform-id": "B" }),
      ]);

      orchestrator.run(document);
      await flush();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(requestAd).not.toHaveBeenCalled();
      expect(requestAdBatch).not.toHaveBeenCalled();
    });

    it("parseSlotConfig returns the passed id whatever the slot says", () => {
      const el = slot({ "data-ad-type-id": "banner", "data-platform-id": "B" });

      expect(parseSlotConfig(el, "A")).toEqual({ platformId: "A", adTypeId: "banner", element: el });
    });
  });
});
