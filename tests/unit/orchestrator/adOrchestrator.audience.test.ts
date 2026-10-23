import {
  createAdOrchestrator,
  type AdDecisionClientLike,
  type AdRendererLike,
} from "../../../src/orchestrator/adOrchestrator";
import { applyQueuedCommand } from "../../../src/orchestrator/queuedCommands";
import type { AdDecisionRequest, AdDecisionResult, BatchEntryResult, BatchSharedFields } from "../../../src/types";

function slot(attributes: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-ad-serve-slot", "");
  el.setAttribute("data-ad-type-id", "banner");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type Batch = (requests: AdDecisionRequest[], shared: BatchSharedFields) => Promise<BatchEntryResult[] | null>;

function setup(slots: HTMLElement[] = [slot()], options: { batch?: Batch | null; warn?: (m: string) => void } = {}) {
  document.body.innerHTML = "";
  document.body.append(...slots);
  const requestAd = jest.fn(async (_request: AdDecisionRequest): Promise<AdDecisionResult> => ({ status: "empty" }));
  const requestAdBatch = jest.fn(
    options.batch ?? (async (requests: AdDecisionRequest[]): Promise<BatchEntryResult[]> => requests.map(() => ({ status: "empty" as const }))),
  );
  const client: AdDecisionClientLike = options.batch === null ? { requestAd } : { requestAd, requestAdBatch };
  const renderer: AdRendererLike = { renderAd: jest.fn() };
  const warn = jest.fn(options.warn);
  const orchestrator = createAdOrchestrator({ platformId: "p1", client, renderer, sessionId: "session-1", warn });
  const run = async (root: ParentNode = document) => {
    orchestrator.run(root);
    await flush();
  };
  return { orchestrator, requestAd, requestAdBatch, warn, run };
}

describe("audience labels on requests (021, US1)", () => {
  it("sends them with a single slot's request", async () => {
    const { orchestrator, requestAd, run } = setup();

    orchestrator.setAudience(["follows-team-x", "age-25-34"]);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(1);
    expect(requestAd.mock.calls[0][0]).toMatchObject({ audience: ["follows-team-x", "age-25-34"], sessionId: "session-1" });
  });

  it("sends them once, in the shared fields, with a batch", async () => {
    const { orchestrator, requestAd, requestAdBatch, run } = setup([slot(), slot(), slot()]);

    orchestrator.setAudience(["follows-team-x"]);
    await run();

    expect(requestAdBatch).toHaveBeenCalledTimes(1);
    expect(requestAdBatch.mock.calls[0][1]).toMatchObject({ audience: ["follows-team-x"] });
    for (const placement of requestAdBatch.mock.calls[0][0]) {
      expect(placement).not.toHaveProperty("audience");
    }
    expect(requestAd).not.toHaveBeenCalled();
  });

  it("carries them on the single requests a failed batch falls back to", async () => {
    const { orchestrator, requestAd, run } = setup([slot(), slot()], { batch: async () => null });

    orchestrator.setAudience(["follows-team-x"]);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(2);
    for (const [request] of requestAd.mock.calls) {
      expect(request.audience).toEqual(["follows-team-x"]);
    }
  });

  it("carries them on each slot's single request when the client has no batch call", async () => {
    const { orchestrator, requestAd, run } = setup([slot(), slot()], { batch: null });

    orchestrator.setAudience(["follows-team-x"]);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(2);
    for (const [request] of requestAd.mock.calls) expect(request.audience).toEqual(["follows-team-x"]);
  });

  it("leaves the request objects without an audience key when none was ever set", async () => {
    const { requestAd, requestAdBatch, run } = setup();
    await run();
    document.body.append(slot(), slot());
    await run();

    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("audience");
    expect(requestAdBatch.mock.calls[0][1]).not.toHaveProperty("audience");
    for (const placement of requestAdBatch.mock.calls[0][0]) expect(placement).not.toHaveProperty("audience");
  });

  it("applies to requests made after the call and leaves earlier ones alone", async () => {
    const { orchestrator, requestAd, run } = setup();

    await run();
    orchestrator.setAudience(["follows-team-x"]);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("audience");
    expect(requestAd.mock.calls[1][0].audience).toEqual(["follows-team-x"]);
  });

  it("does not change how slots are batched: different categories still share one batch", async () => {
    const { orchestrator, requestAdBatch, run } = setup([slot({ "data-category": "music" }), slot({ "data-category": "sports" })]);

    orchestrator.setAudience(["follows-team-x"]);
    await run();

    expect(requestAdBatch).toHaveBeenCalledTimes(1);
    expect(requestAdBatch.mock.calls[0][0].map((r) => r.category)).toEqual(["music", "sports"]);
  });

  it("does not make a slot new when the labels change: it is not re-requested", async () => {
    const { orchestrator, requestAd, run } = setup();

    await run();
    orchestrator.setAudience(["a"]);
    await run();
    orchestrator.setAudience(["b"]);
    await run();

    expect(requestAd).toHaveBeenCalledTimes(1);
  });
});

describe("changing and clearing the labels (021, US3)", () => {
  it("a second list replaces the first, it is not merged", async () => {
    const { orchestrator, requestAd, run } = setup();

    orchestrator.setAudience(["a"]);
    await run();
    orchestrator.setAudience(["b"]);
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(["a"]);
    expect(requestAd.mock.calls[1][0].audience).toEqual(["b"]);
  });

  it.each([null, []])("%p clears them, without a warning", async (cleared) => {
    const { orchestrator, requestAd, warn, run } = setup();

    orchestrator.setAudience(["a"]);
    orchestrator.setAudience(cleared);
    await run();

    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("audience");
    expect(warn).not.toHaveBeenCalled();
  });

  it("can be set again after a clear", async () => {
    const { orchestrator, requestAd, run } = setup();

    orchestrator.setAudience(["a"]);
    orchestrator.setAudience(null);
    orchestrator.setAudience(["c"]);
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(["c"]);
  });

  it.each([
    ["a string", "follows-team-x"],
    ["a number", 7],
    ["an object", { labels: ["a"] }],
    ["undefined", undefined],
    ["a symbol", Symbol("x")],
  ])("refuses %s: nothing changes and it warns once", async (_name, value) => {
    const { orchestrator, requestAd, warn, run } = setup();

    orchestrator.setAudience(["keep-me"]);
    orchestrator.setAudience(value);
    await run();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("setAudience ignored");
    expect(requestAd.mock.calls[0][0].audience).toEqual(["keep-me"]);
  });

  it("clears the previous labels, with one warning, for a list with entries but none usable", async () => {
    const { orchestrator, requestAd, warn, run } = setup();

    orchestrator.setAudience(["previous-viewer"]);
    orchestrator.setAudience(["has space", 3, ""]);
    await run();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("setAudience: none of the labels were usable");
    expect(requestAd.mock.calls[0][0]).not.toHaveProperty("audience");
  });

  it("never lets an error out, whether the warning function throws or is missing", () => {
    const throwing = setup([slot()], { warn: () => { throw new Error("console broke"); } });
    expect(() => throwing.orchestrator.setAudience("bad")).not.toThrow();

    document.body.innerHTML = "";
    const orchestrator = createAdOrchestrator({
      platformId: "p1",
      client: { requestAd: jest.fn(async () => ({ status: "empty" as const })) },
      renderer: { renderAd: jest.fn() },
    });
    expect(() => orchestrator.setAudience("bad")).not.toThrow();
  });

  it("works through the queued-command path the page uses", async () => {
    const { orchestrator, requestAd, run } = setup();
    const handlers = { setAudience: orchestrator.setAudience };

    applyQueuedCommand(["setAudience", ["Follows-Team-X"]], handlers);
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(["follows-team-x"]);
  });
});

describe("cleaning what the page gives (021, US4)", () => {
  it("sends the cleaned form", async () => {
    const { orchestrator, requestAd, run } = setup();

    orchestrator.setAudience([" Follows-Team-X ", "AGE-25-34", "has space", 4, "follows-team-x"]);
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(["follows-team-x", "age-25-34"]);
  });

  it("sends only the first 20 of 25 valid labels", async () => {
    const { orchestrator, requestAd, run } = setup();
    const many = Array.from({ length: 25 }, (_, i) => `x${i}`);

    orchestrator.setAudience(many);
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(many.slice(0, 20));
  });

  it("keeps its own copy: changing the page's array afterwards changes nothing", async () => {
    const { orchestrator, requestAd, run } = setup();
    const mine = ["a"];

    orchestrator.setAudience(mine);
    mine.push("b");
    mine[0] = "z";
    await run();

    expect(requestAd.mock.calls[0][0].audience).toEqual(["a"]);
  });

  it("hands the client its own copy: a client that changes it does not change later requests", async () => {
    const { orchestrator, requestAd, run } = setup();
    requestAd.mockImplementationOnce(async (request) => {
      request.audience?.push("tampered");
      return { status: "empty" };
    });

    orchestrator.setAudience(["a"]);
    await run();
    document.body.append(slot());
    await run();

    expect(requestAd.mock.calls[1][0].audience).toEqual(["a"]);
  });
});
