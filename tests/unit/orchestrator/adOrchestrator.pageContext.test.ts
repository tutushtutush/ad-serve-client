import {
  createAdOrchestrator,
  type AdDecisionClientLike,
  type AdRendererLike,
} from "../../../src/orchestrator/adOrchestrator";
import type { AdDecisionResult } from "../../../src/types";
import { makeAd } from "../fixtures/adCreative";

function createSlotElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  el.setAttribute("data-platform-id", "p1");
  el.setAttribute("data-ad-type-id", "banner");
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

function setup(...slots: HTMLElement[]) {
  document.body.innerHTML = "";
  document.body.append(...slots);
  const client: AdDecisionClientLike = {
    requestAd: jest.fn(async (): Promise<AdDecisionResult> => ({ status: "empty" })),
  };
  const renderer: AdRendererLike = { renderAd: jest.fn() };
  const orchestrator = createAdOrchestrator({ client, renderer });
  const categories = () =>
    (client.requestAd as jest.Mock).mock.calls.map(([request]) => request.category);
  return { client, renderer, orchestrator, categories };
}

describe("page-level category context", () => {
  describe("declaring categories (US1)", () => {
    it("sends the declared category with every untagged slot's request", async () => {
      const { orchestrator, categories } = setup(createSlotElement(), createSlotElement());

      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music", "music"]);
    });

    it("joins several categories into one comma-separated value", async () => {
      const { orchestrator, categories } = setup(createSlotElement());

      orchestrator.setContext({ categories: ["music", "IAB17"] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music,IAB17"]);
    });

    it("normalizes the declared list (trim, de-duplicate)", async () => {
      const { orchestrator, categories } = setup(createSlotElement());

      orchestrator.setContext({ categories: [" music ", "Music", ""] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music"]);
    });

    it("sends no category when nothing was declared", async () => {
      const { orchestrator, categories } = setup(createSlotElement());

      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual([undefined]);
    });

    it("uses the current context for a slot discovered by a later run()", async () => {
      const { orchestrator, categories } = setup(createSlotElement());
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      const late = createSlotElement();
      document.body.append(late);
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music", "music"]);
    });
  });

  describe("updating and clearing (US2)", () => {
    it("replaces the previous declaration instead of merging", async () => {
      const first = createSlotElement();
      const { orchestrator, categories } = setup(first);
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      orchestrator.setContext({ categories: ["comedy"] });
      const second = createSlotElement();
      document.body.append(second);
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music", "comedy"]);
    });

    it.each([[{}], [{ categories: [] }], [{ categories: undefined }]])(
      "clears the context for %j",
      async (payload) => {
        const { orchestrator, categories } = setup(createSlotElement());
        orchestrator.setContext({ categories: ["music"] });

        orchestrator.setContext(payload);
        orchestrator.run(document);
        await flush();

        expect(categories()).toEqual([undefined]);
      },
    );

    it.each([["oops"], [null], [5], [["music"]], [{ categories: "music" }], [{ categories: 7 }], [{ categories: [123, null] }], [{ categories: ["  ", ""] }]])(
      "ignores the malformed declaration %j and keeps the previous categories",
      async (payload) => {
        const { orchestrator, categories } = setup(createSlotElement());
        orchestrator.setContext({ categories: ["music"] });

        expect(() => orchestrator.setContext(payload)).not.toThrow();
        orchestrator.run(document);
        await flush();

        expect(categories()).toEqual(["music"]);
      },
    );

    it("keeps the good entries of a list that also contains bad ones", async () => {
      const { orchestrator, categories } = setup(createSlotElement());

      orchestrator.setContext({ categories: ["music", 5, null, "  "] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music"]);
    });

    it("makes no request and renders nothing by itself", async () => {
      const { orchestrator, client, renderer } = setup(createSlotElement());

      orchestrator.setContext({ categories: ["music"] });
      await flush();

      expect(client.requestAd).not.toHaveBeenCalled();
      expect(renderer.renderAd).not.toHaveBeenCalled();
    });

    it("leaves an in-flight request with the category it was made with", async () => {
      const el = createSlotElement();
      const { promise, resolve } = deferred<AdDecisionResult>();
      const { orchestrator, client, categories } = setup(el);
      (client.requestAd as jest.Mock).mockImplementation(() => promise);
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);

      orchestrator.setContext({ categories: ["comedy"] });
      resolve({ status: "empty" });
      await flush();

      expect(categories()).toEqual(["music"]);
      expect(client.requestAd).toHaveBeenCalledTimes(1);
    });

    it("does not re-request an already-filled slot when the context changes and the page is refreshed", async () => {
      const { orchestrator, client } = setup(createSlotElement());
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      orchestrator.setContext({ categories: ["comedy"] });
      orchestrator.run(document);
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
    });

    it("gives a slot inserted after navigation the new categories", async () => {
      const { orchestrator, categories } = setup(createSlotElement());
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      const container = document.createElement("div");
      const added = createSlotElement();
      container.append(added);
      document.body.append(container);
      orchestrator.setContext({ categories: ["comedy"] });
      orchestrator.run(container);
      await flush();

      expect(categories()).toEqual(["music", "comedy"]);
    });
  });

  describe("slot-level override (US3)", () => {
    it("uses the slot's own category and does not merge the page's", async () => {
      const { orchestrator, categories } = setup(
        createSlotElement({ "data-category": "sports" }),
        createSlotElement(),
      );

      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["sports", "music"]);
    });

    it("treats a whitespace-only slot category as absent and uses the page's", async () => {
      const { orchestrator, categories } = setup(createSlotElement({ "data-category": "   " }));

      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["music"]);
    });

    it("still honors a slot-level comma-separated list", async () => {
      const { orchestrator, categories } = setup(createSlotElement({ "data-category": "sports,IAB1-6" }));

      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);
      await flush();

      expect(categories()).toEqual(["sports,IAB1-6"]);
    });

    it("keeps slot identity stable when the context changes mid-flight (replacement element still gets the ad)", async () => {
      const original = createSlotElement();
      const { promise, resolve } = deferred<AdDecisionResult>();
      const { orchestrator, client, renderer } = setup(original);
      (client.requestAd as jest.Mock).mockImplementation(() => promise);
      orchestrator.setContext({ categories: ["music"] });
      orchestrator.run(document);

      orchestrator.setContext({ categories: ["comedy"] });
      const replacement = createSlotElement();
      original.replaceWith(replacement);
      await flush();
      resolve({ status: "filled", ad: makeAd() });
      await flush();

      expect(client.requestAd).toHaveBeenCalledTimes(1);
      const [renderedElement] = (renderer.renderAd as jest.Mock).mock.calls[0];
      expect(renderedElement).toBe(replacement);
    });
  });
});
