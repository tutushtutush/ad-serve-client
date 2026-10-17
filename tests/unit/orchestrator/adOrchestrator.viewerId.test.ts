import {
  createAdOrchestrator,
  type AdDecisionClientLike,
  type AdRendererLike,
} from "../../../src/orchestrator/adOrchestrator";
import { applyQueuedCommand } from "../../../src/orchestrator/queuedCommands";
import type { AdDecisionRequest, AdDecisionResult, BatchEntryResult, BatchSharedFields } from "../../../src/types";
import type { ViewerIdStoreLike } from "../../../src/utils/viewerId";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER = "11111111-1111-1111-1111-111111111111";
const KEPT = "22222222-2222-2222-2222-222222222222";

function slot(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  el.setAttribute("data-ad-type-id", "banner");
  return el;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeStore(over: Partial<ViewerIdStoreLike> = {}): ViewerIdStoreLike & { getOrCreate: jest.Mock; remove: jest.Mock } {
  return { getOrCreate: jest.fn().mockReturnValue(KEPT), remove: jest.fn(), ...over } as never;
}

type Batch = (requests: AdDecisionRequest[], shared: BatchSharedFields) => Promise<BatchEntryResult[] | null>;

function setup(slotCount = 1, options: { store?: ViewerIdStoreLike; batch?: Batch | null } = {}) {
  document.body.innerHTML = "";
  document.body.append(...Array.from({ length: slotCount }, slot));
  const requestAd = jest.fn(async (_request: AdDecisionRequest): Promise<AdDecisionResult> => ({ status: "empty" }));
  const requestAdBatch = jest.fn(
    options.batch ?? (async (requests: AdDecisionRequest[]): Promise<BatchEntryResult[]> => requests.map(() => ({ status: "empty" as const }))),
  );
  const client: AdDecisionClientLike = options.batch === null ? { requestAd } : { requestAd, requestAdBatch };
  const renderer: AdRendererLike = { renderAd: jest.fn() };
  const warn = jest.fn();
  const orchestrator = createAdOrchestrator({
    platformId: "p1",
    client,
    renderer,
    sessionId: "session-1",
    warn,
    viewerIdStore: options.store,
  });
  const run = async (root: ParentNode = document) => {
    orchestrator.run(root);
    await flush();
  };
  return { orchestrator, requestAd, requestAdBatch, warn, run };
}

describe("platform-supplied viewer identifier (017, US1)", () => {
  it("sends it with a single slot's request", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    orchestrator.setViewerId(UUID);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(1);
    expect(requestAd.mock.calls[0][0]).toMatchObject({ viewerId: UUID, sessionId: "session-1" });
  });

  it("sends it once, in the shared fields, with a batch", async () => {
    const { orchestrator, requestAd, requestAdBatch, run } = setup(3);

    orchestrator.setViewerId(UUID);
    await run();

    expect(requestAdBatch).toHaveBeenCalledTimes(1);
    expect(requestAdBatch.mock.calls[0][1]).toMatchObject({ viewerId: UUID });
    for (const placement of requestAdBatch.mock.calls[0][0]) {
      expect(placement).not.toHaveProperty("viewerId");
    }
    expect(requestAd).not.toHaveBeenCalled();
  });

  it("carries it on the single requests a failed batch falls back to", async () => {
    const { orchestrator, requestAd, run } = setup(2, { batch: async () => null });

    orchestrator.setViewerId(UUID);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(2);
    for (const [request] of requestAd.mock.calls) {
      expect(request.viewerId).toBe(UUID);
    }
  });

  it("applies to requests made after the call and leaves earlier ones alone", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    await run();
    orchestrator.setViewerId(UUID);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");
    expect(requestAd.mock.calls[1][0].viewerId).toBe(UUID);
  });

  it("replaces an earlier identifier for later requests", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    orchestrator.setViewerId(UUID);
    await run();
    orchestrator.setViewerId(OTHER);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls.map(([request]) => request.viewerId)).toEqual([UUID, OTHER]);
  });

  it.each(["abc", UUID.slice(1), ` ${UUID}`, 5, {}, [UUID], true, undefined])(
    "ignores %p with one warning, changes nothing and never throws",
    async (value) => {
      const { orchestrator, requestAd, warn, run } = setup(1);
      orchestrator.setViewerId(UUID);

      expect(() => orchestrator.setViewerId(value)).not.toThrow();
      await run();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("UUID");
      expect(requestAd.mock.calls[0][0].viewerId).toBe(UUID);
    },
  );

  it("survives a warn that throws", () => {
    const { orchestrator, warn } = setup(1);
    warn.mockImplementation(() => {
      throw new Error("console broken");
    });

    expect(() => orchestrator.setViewerId("nope")).not.toThrow();
  });

  it("is applied from a queued command before the first request", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    applyQueuedCommand(["setViewerId", UUID], { setViewerId: orchestrator.setViewerId });
    await run();

    expect(requestAd.mock.calls[0][0].viewerId).toBe(UUID);
  });
});

describe("without opt-in nothing is sent or stored (017, US4)", () => {
  it("never puts a viewerId key on any request object, single or batch", async () => {
    const single = setup(1);
    await single.run();
    expect(single.requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");

    const batch = setup(3);
    await batch.run();
    expect(batch.requestAdBatch.mock.calls[0][1]).not.toHaveProperty("viewerId");
    expect(batch.warn).not.toHaveBeenCalled();
  });

  it("never touches a store it was not given, however setViewerId is used", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    orchestrator.setViewerId(null);
    await run();

    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");
  });

  it("does not consult a supplied store until a request is built", async () => {
    const store = fakeStore();
    const { orchestrator, run } = setup(1, { store });

    orchestrator.setViewerId(UUID);
    expect(store.getOrCreate).not.toHaveBeenCalled();
    await run();
    expect(store.getOrCreate).not.toHaveBeenCalled(); // the platform's identifier won, so it was never needed
  });
});

describe("the identifier the SDK keeps on opt-in (017, US2)", () => {
  it("resolves the store once, on the first request, and sends the value on every request", async () => {
    const store = fakeStore();
    const { requestAd, run } = setup(1, { store });

    await run();
    document.body.append(slot());
    await run();

    expect(store.getOrCreate).toHaveBeenCalledTimes(1);
    expect(requestAd.mock.calls.map(([request]) => request.viewerId)).toEqual([KEPT, KEPT]);
  });

  it("sends it with a batch too", async () => {
    const { requestAdBatch, run } = setup(2, { store: fakeStore() });

    await run();

    expect(requestAdBatch.mock.calls[0][1].viewerId).toBe(KEPT);
  });

  it("lets the platform's identifier take precedence, without touching the store", async () => {
    const store = fakeStore();
    const { orchestrator, requestAd, run } = setup(1, { store });

    orchestrator.setViewerId(UUID);
    await run();

    expect(requestAd.mock.calls[0][0].viewerId).toBe(UUID);
    expect(store.getOrCreate).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("sends none, and says nothing, when the store has no identifier, and does not ask again", async () => {
    const store = fakeStore({ getOrCreate: jest.fn().mockReturnValue(undefined) });
    const { requestAd, warn, run } = setup(1, { store });

    await run();
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls.every(([request]) => !("viewerId" in request))).toBe(true);
    expect(store.getOrCreate).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("swallows a store that throws, and still serves the ad request", async () => {
    const store = fakeStore({
      getOrCreate: jest.fn(() => {
        throw new Error("blocked");
      }),
    });
    const { requestAd, run } = setup(1, { store });

    await run();

    expect(requestAd).toHaveBeenCalledTimes(1);
    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");
  });

  it("never asks the store on a page with no slots", async () => {
    const store = fakeStore();
    const { run } = setup(0, { store });

    await run();

    expect(store.getOrCreate).not.toHaveBeenCalled();
  });
});

describe("withdrawing the identifier (017, US3)", () => {
  it("stops sending the platform's identifier", async () => {
    const { orchestrator, requestAd, run } = setup(1);

    orchestrator.setViewerId(UUID);
    await run();
    orchestrator.setViewerId(null);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[0][0].viewerId).toBe(UUID);
    expect(requestAd.mock.calls[1][0]).not.toHaveProperty("viewerId");
  });

  it.each([null, ""])("treats %p as a withdrawal: the kept identifier is removed and not created again", async (value) => {
    const store = fakeStore();
    const { orchestrator, requestAd, run } = setup(1, { store });

    await run();
    orchestrator.setViewerId(value);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[0][0].viewerId).toBe(KEPT);
    expect(requestAd.mock.calls[1][0]).not.toHaveProperty("viewerId");
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.getOrCreate).toHaveBeenCalledTimes(1);
  });

  it("withdrawing before any request means the opt-in never creates one", async () => {
    const store = fakeStore();
    const { orchestrator, requestAd, run } = setup(1, { store });

    orchestrator.setViewerId(null);
    await run();

    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.getOrCreate).not.toHaveBeenCalled();
    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");
  });

  it("a queued withdrawal applied before the first request behaves the same", async () => {
    const store = fakeStore();
    const { orchestrator, requestAd, run } = setup(1, { store });

    applyQueuedCommand(["setViewerId", null], { setViewerId: orchestrator.setViewerId });
    await run();

    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("viewerId");
  });

  it("lets the platform supply an identifier again after withdrawing", async () => {
    const { orchestrator, requestAd, run } = setup(1, { store: fakeStore() });

    orchestrator.setViewerId(null);
    orchestrator.setViewerId(UUID);
    await run();

    expect(requestAd.mock.calls[0][0].viewerId).toBe(UUID);
  });

  it("swallows a store whose removal throws", () => {
    const store = fakeStore({
      remove: jest.fn(() => {
        throw new Error("blocked");
      }),
    });
    const { orchestrator } = setup(1, { store });

    expect(() => orchestrator.setViewerId(null)).not.toThrow();
  });
});
