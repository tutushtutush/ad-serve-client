import {
  createAdOrchestrator,
  parseSlotConfig,
  type AdDecisionClientLike,
  type AdRendererLike,
  type ViewabilityDetectorLike,
  type ViewableImpressionClientLike,
} from "../../../src/orchestrator/adOrchestrator";
import type { AdDecisionResult } from "../../../src/types";
import { makeAd } from "../fixtures/adCreative";

function createSlotElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  el.setAttribute("data-platform-id", "p1");
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

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const RESPONSIVE = "0:mobile-leaderboard,768:leaderboard,1024:billboard";

function setup(width: number | (() => number), ...slots: HTMLElement[]) {
  document.body.innerHTML = "";
  document.body.append(...slots);
  const client: AdDecisionClientLike = {
    requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "empty" })),
  };
  const renderer: AdRendererLike = { renderAd: jest.fn() };
  const watches: Array<{ onViewable: () => void }> = [];
  const viewabilityDetector: ViewabilityDetectorLike = {
    watch: jest.fn((_element: Element, onViewable: () => void) => {
      watches.push({ onViewable });
      return jest.fn();
    }),
  };
  const trackingClient: ViewableImpressionClientLike = { reportViewableImpression: jest.fn() };
  const orchestrator = createAdOrchestrator({
    client,
    renderer,
    viewabilityDetector,
    trackingClient,
    getViewportWidth: typeof width === "function" ? width : () => width,
  });
  const requestedTypes = () =>
    (client.requestAd as jest.Mock).mock.calls.map(([request]) => request.adTypeId);
  return { client, renderer, trackingClient, watches, orchestrator, requestedTypes };
}

describe("parseSlotConfig with data-ad-types", () => {
  it("resolves the type for the given width", () => {
    const el = createSlotElement({ "data-ad-types": RESPONSIVE });

    expect(parseSlotConfig(el, 390)?.adTypeId).toBe("mobile-leaderboard");
    expect(parseSlotConfig(el, 768)?.adTypeId).toBe("leaderboard");
    expect(parseSlotConfig(el, 1280)?.adTypeId).toBe("billboard");
  });

  it("returns null when nothing resolves", () => {
    const el = createSlotElement({ "data-ad-types": "768:leaderboard" });

    expect(parseSlotConfig(el, 390)).toBeNull();
  });
});

describe("responsive ad types", () => {
  describe("choosing the type per screen (US1)", () => {
    it("requests the phone type on a phone-width screen", async () => {
      const { orchestrator, requestedTypes } = setup(390, createSlotElement({ "data-ad-types": RESPONSIVE }));

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["mobile-leaderboard"]);
    });

    it("requests the largest type that fits on a wide screen", async () => {
      const { orchestrator, requestedTypes } = setup(1280, createSlotElement({ "data-ad-types": RESPONSIVE }));

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["billboard"]);
    });

    it("treats a minimum width as inclusive", async () => {
      const { orchestrator, requestedTypes } = setup(768, createSlotElement({ "data-ad-types": RESPONSIVE }));

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["leaderboard"]);
    });

    it("picks the largest minimum width that fits between breakpoints", async () => {
      const { orchestrator, requestedTypes } = setup(900, createSlotElement({ "data-ad-types": RESPONSIVE }));

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["leaderboard"]);
    });

    it("makes exactly one request per slot", async () => {
      const { orchestrator, client } = setup(1280, createSlotElement({ "data-ad-types": RESPONSIVE }));

      orchestrator.run(document);
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
    });
  });

  describe("single-type slots and precedence (US2)", () => {
    it("requests the single type at any width when no list is given", async () => {
      const el = createSlotElement({ "data-ad-type-id": "banner" });
      const phone = setup(390, el);
      phone.orchestrator.run(document);
      await flush();

      const desktop = setup(1280, createSlotElement({ "data-ad-type-id": "banner" }));
      desktop.orchestrator.run(document);
      await flush();

      expect(phone.requestedTypes()).toEqual(["banner"]);
      expect(desktop.requestedTypes()).toEqual(["banner"]);
    });

    it("lets a usable list win over the single type", async () => {
      const { orchestrator, requestedTypes } = setup(
        1280,
        createSlotElement({ "data-ad-type-id": "banner", "data-ad-types": RESPONSIVE }),
      );

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["billboard"]);
    });

    it("falls back to the single type when the list yields nothing", async () => {
      const { orchestrator, requestedTypes } = setup(
        390,
        createSlotElement({ "data-ad-type-id": "banner", "data-ad-types": "768:leaderboard" }),
      );

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["banner"]);
    });
  });

  describe("reporting and identity (US3)", () => {
    it("renders and reports clicks and views with the resolved type", async () => {
      const { orchestrator, client, renderer, trackingClient, watches } = setup(
        390,
        createSlotElement({ "data-ad-types": RESPONSIVE }),
      );
      (client.requestAd as jest.Mock).mockResolvedValue({
        status: "filled",
        ad: { ...makeAd(), adConfigId: "config-1" },
      });

      orchestrator.run(document);
      await flush();
      watches[0].onViewable();

      const [, , placement] = (renderer.renderAd as jest.Mock).mock.calls[0];
      expect(placement).toEqual({ platformId: "p1", adTypeId: "mobile-leaderboard" });
      expect(trackingClient.reportViewableImpression).toHaveBeenCalledWith(
        expect.objectContaining({ adTypeId: "mobile-leaderboard" }),
      );
    });

    it("causes no new request and no change when the width changes after discovery", async () => {
      let width = 1280;
      const { orchestrator, client, requestedTypes } = setup(() => width, createSlotElement({ "data-ad-types": RESPONSIVE }));
      orchestrator.run(document);
      await flush();

      width = 390;
      await flush();
      orchestrator.run(document);
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
      expect(requestedTypes()).toEqual(["billboard"]);
    });

    it("keeps the slot's ad when its element is replaced after the width changed", async () => {
      let width = 1280;
      const original = createSlotElement({ "data-ad-types": RESPONSIVE });
      const { orchestrator, client, renderer, requestedTypes } = setup(() => width, original);
      const { promise, resolve } = deferred<AdDecisionResult>();
      (client.requestAd as jest.Mock).mockImplementation(() => promise);
      orchestrator.run(document);

      width = 390;
      const replacement = createSlotElement({ "data-ad-types": RESPONSIVE });
      original.replaceWith(replacement);
      await flush();
      resolve({ status: "filled", ad: makeAd() });
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
      expect(requestedTypes()).toEqual(["billboard"]);
      const [renderedElement, , placement] = (renderer.renderAd as jest.Mock).mock.calls[0];
      expect(renderedElement).toBe(replacement);
      expect(placement.adTypeId).toBe("billboard");
    });

    it("keeps the slot's ad when its element is replaced and nothing resolves at the new width", async () => {
      let width = 1280;
      const original = createSlotElement({ "data-ad-types": "768:leaderboard" });
      const { orchestrator, client, renderer } = setup(() => width, original);
      const { promise, resolve } = deferred<AdDecisionResult>();
      (client.requestAd as jest.Mock).mockImplementation(() => promise);
      orchestrator.run(document);

      width = 390;
      const replacement = createSlotElement({ "data-ad-types": "768:leaderboard" });
      original.replaceWith(replacement);
      await flush();
      resolve({ status: "filled", ad: makeAd() });
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
      expect((renderer.renderAd as jest.Mock).mock.calls[0][0]).toBe(replacement);
    });
  });

  describe("mistakes never break the page (US4)", () => {
    it("uses the valid entry next to malformed ones", async () => {
      const { orchestrator, requestedTypes } = setup(
        1280,
        createSlotElement({ "data-ad-types": "abc:x,768:leaderboard,-5:y,:z" }),
      );

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["leaderboard"]);
    });

    it("makes no request and does not throw when nothing is usable and there is no single type", async () => {
      const { orchestrator, client } = setup(1280, createSlotElement({ "data-ad-types": "abc:x,nocolon" }));

      expect(() => orchestrator.run(document)).not.toThrow();
      await flush();

      expect(client.requestAd).not.toHaveBeenCalled();
    });

    it("makes no request when the screen is narrower than every minimum and there is no single type", async () => {
      const { orchestrator, client } = setup(390, createSlotElement({ "data-ad-types": "768:leaderboard" }));

      orchestrator.run(document);
      await flush();

      expect(client.requestAd).not.toHaveBeenCalled();
    });

    it.each([
      [() => {
        throw new Error("blocked");
      }],
      [() => NaN],
      [() => -1],
    ])("treats an unusable width source as 0", async (getWidth) => {
      const { orchestrator, requestedTypes } = setup(
        getWidth as () => number,
        createSlotElement({ "data-ad-types": RESPONSIVE }),
      );

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["mobile-leaderboard"]);
    });

    it("does not let one bad slot affect another", async () => {
      const { orchestrator, requestedTypes } = setup(
        1280,
        createSlotElement({ "data-ad-types": "garbage" }),
        createSlotElement({ "data-ad-types": RESPONSIVE }),
      );

      orchestrator.run(document);
      await flush();

      expect(requestedTypes()).toEqual(["billboard"]);
    });
  });
});
